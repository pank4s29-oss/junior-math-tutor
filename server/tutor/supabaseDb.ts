import { nanoid } from "nanoid";
import type { Grade, TutorMode } from "../../shared/mathCurriculum";
import type { SupabaseAuthenticatedUser } from "../supabaseAuth";
import { getSupabaseServerClient } from "../supabase";

const DAILY_LIMIT = 20;
const REQUEST_COOLDOWN_MS = 3500;
const MATH_BUCKET = "math-problems";
const SUPPORTED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

type AppUser = { id: string; role: "student" | "teacher" | "admin" };
type AnySupabase = any;

function supabase(): AnySupabase {
  return getSupabaseServerClient() as AnySupabase;
}

function fail(error: { message: string } | null, action: string): asserts error is null {
  if (error) throw new Error(`${action}失敗：${error.message}`);
}

export function evaluateSolveQuota(record: { requestCount: number; lastRequestedAt: Date } | undefined, now: Date) {
  if (!record) return { allowed: true, remaining: DAILY_LIMIT - 1, nextRequestCount: 1 };
  const elapsed = now.getTime() - record.lastRequestedAt.getTime();
  if (elapsed < REQUEST_COOLDOWN_MS) return { allowed: false, remaining: Math.max(0, DAILY_LIMIT - record.requestCount), nextRequestCount: record.requestCount, message: "請稍候幾秒再送出，讓我完整整理上一題。" };
  if (record.requestCount >= DAILY_LIMIT) return { allowed: false, remaining: 0, nextRequestCount: record.requestCount, message: "你今天的解題額度已用完，明天再繼續練習，或先回顧錯題本。" };
  return { allowed: true, remaining: DAILY_LIMIT - record.requestCount - 1, nextRequestCount: record.requestCount + 1 };
}

/** Maps a validated Supabase Auth account to its stable internal app UUID. */
export async function getOrCreateAppUser(user: SupabaseAuthenticatedUser): Promise<AppUser> {
  const client = supabase();
  const { data: existing, error: lookupError } = await client.from("app_users")
    .select("id, role").eq("supabase_auth_user_id", user.id).maybeSingle();
  fail(lookupError, "讀取 Supabase 使用者身分映射");
  const base = {
    display_name: user.name ?? null,
    email: user.email ?? null,
    role: user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student",
  };
  if (existing) {
    const { data, error } = await client.from("app_users").update(base).eq("id", existing.id).select("id, role").single();
    fail(error, "更新 Supabase 使用者身分映射");
    return data as AppUser;
  }
  const { data, error } = await client.from("app_users").insert({ ...base, supabase_auth_user_id: user.id }).select("id, role").single();
  fail(error, "建立 Supabase 使用者身分映射");
  return data as AppUser;
}

export async function assertSupabaseAdmin(user: SupabaseAuthenticatedUser) {
  const appUser = await getOrCreateAppUser(user);
  if (appUser.role !== "teacher" && appUser.role !== "admin") throw new Error("Supabase 教師權限不足。");
  return appUser;
}

export async function consumeSolveQuota(userId: string) {
  const { data, error } = await supabase().rpc("consume_tutor_quota", { p_user_id: userId, p_daily_limit: DAILY_LIMIT, p_cooldown_seconds: 4 });
  fail(error, "檢查解題額度");
  const decision = data as { allowed: boolean; remaining: number; message?: string };
  return decision;
}

export async function uploadMathPhoto(input: { userId: string; filename: string; mimeType: string; bytes: Buffer }) {
  if (!SUPPORTED_ATTACHMENT_TYPES.includes(input.mimeType as (typeof SUPPORTED_ATTACHMENT_TYPES)[number])) throw new Error("題目檔案格式不受支援。");
  const maxBytes = input.mimeType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (input.bytes.length === 0 || input.bytes.length > maxBytes) throw new Error("題目檔案大小不符合處理限制。");
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "math-problem";
  const storagePath = `${input.userId}/${Date.now()}-${nanoid(10)}-${safeName}`;
  const { error: uploadError } = await supabase().storage.from(MATH_BUCKET).upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  fail(uploadError, "上傳題目照片");

  const { data, error } = await supabase().from("math_attachments").insert({
    user_id: input.userId,
    bucket_id: MATH_BUCKET,
    storage_path: storagePath,
    original_name: safeName,
    mime_type: input.mimeType,
    byte_size: input.bytes.length,
    recognition_status: "pending",
  }).select("id").single();
  if (error) {
    await supabase().storage.from(MATH_BUCKET).remove([storagePath]);
    fail(error, "保存題目照片參照");
  }
  return { attachmentId: String(data.id), storagePath };
}

export async function getAttachmentForUser(userId: string, attachmentId: string) {
  const { data, error } = await supabase()
    .from("math_attachments")
    .select("id, storage_path, mime_type, recognition_status")
    .eq("id", attachmentId)
    .eq("user_id", userId)
    .maybeSingle();
  fail(error, "讀取題目照片參照");
  return data ? {
    id: String(data.id), storagePath: String(data.storage_path), mimeType: String(data.mime_type),
    recognitionStatus: String(data.recognition_status),
  } : undefined;
}

/** 僅由已通過附件擁有權檢查的伺服器端流程呼叫。 */
export async function downloadMathPhoto(storagePath: string, mimeType: string) {
  if (!SUPPORTED_ATTACHMENT_TYPES.includes(mimeType as (typeof SUPPORTED_ATTACHMENT_TYPES)[number])) {
    throw new Error("題目檔案格式不受支援。");
  }
  const { data, error } = await supabase().storage.from(MATH_BUCKET).download(storagePath);
  fail(error, "讀取私有題目照片");
  if (!data) throw new Error("找不到私有題目檔案內容。");
  const bytes = Buffer.from(await data.arrayBuffer());
  const maxBytes = mimeType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (bytes.length === 0 || bytes.length > maxBytes) throw new Error("題目檔案大小不符合處理限制。");
  return {
    data: bytes.toString("base64"),
    mimeType: mimeType as (typeof SUPPORTED_ATTACHMENT_TYPES)[number],
  };
}

export async function createAttachmentSignedUrl(storagePath: string) {
  const { data, error } = await supabase().storage.from(MATH_BUCKET).createSignedUrl(storagePath, 5 * 60);
  fail(error, "建立題目照片安全連結");
  if (!data?.signedUrl) throw new Error("無法建立題目照片安全連結。");
  return data.signedUrl;
}

export async function updateAttachmentRecognition(attachmentId: string, status: "readable" | "unclear") {
  const { error } = await supabase().from("math_attachments").update({ recognition_status: status }).eq("id", attachmentId);
  fail(error, "更新題目辨識狀態");
}

export async function createConversation(input: { userId: string; title: string; grade: Grade; unitKey: string }) {
  const { data, error } = await supabase().from("math_conversations").insert({
    user_id: input.userId, title: input.title, grade: input.grade, unit_key: input.unitKey,
  }).select("id").single();
  fail(error, "保存解題對話");
  return String(data.id);
}

export async function getConversationForUser(userId: string, conversationId: string) {
  const { data, error } = await supabase().from("math_conversations")
    .select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  fail(error, "驗證解題對話擁有權");
  return data ? String(data.id) : undefined;
}

export async function createMathAttempt(input: {
  userId: string; conversationId: string; grade: Grade; unitKey: string; mode: TutorMode;
  questionText: string; attachmentId?: string; responseMarkdown: string; responseJson: string;
  confidence: number; needsClarification: boolean; errorTags: string; model: string;
}) {
  let responseJson: unknown = {};
  let errorTags: unknown = [];
  try { responseJson = JSON.parse(input.responseJson); } catch { /* Safe structured fallback. */ }
  try { errorTags = JSON.parse(input.errorTags); } catch { /* Safe structured fallback. */ }
  const { data, error } = await supabase().from("math_attempts").insert({
    user_id: input.userId, conversation_id: input.conversationId, grade: input.grade, unit_key: input.unitKey,
    mode: input.mode, question_text: input.questionText, attachment_id: input.attachmentId ?? null,
    response_markdown: input.responseMarkdown, response_json: responseJson, confidence: input.confidence,
    needs_clarification: input.needsClarification, error_tags: errorTags, model: input.model,
  }).select("id").single();
  fail(error, "保存解題紀錄");
  return String(data.id);
}

export async function listRecentAttempts(userId: string) {
  const { data, error } = await supabase().from("math_attempts")
    .select("id, question_text, unit_key, mode, confidence, error_tags, needs_clarification, student_marked_wrong, student_mistake_note, student_marked_wrong_at, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  fail(error, "讀取解題紀錄");
  return (data ?? []).map((row: any) => ({
    id: String(row.id), questionText: row.question_text, unitKey: row.unit_key, mode: row.mode,
    confidence: row.confidence, errorTags: JSON.stringify(row.error_tags ?? []),
    needsClarification: row.needs_clarification, studentMarkedWrong: Boolean(row.student_marked_wrong),
    studentMistakeNote: row.student_mistake_note ?? null, studentMarkedWrongAt: row.student_marked_wrong_at ?? null, createdAt: row.created_at,
  }));
}

export async function getAttemptForUser(userId: string, attemptId: string) {
  const { data, error } = await supabase().from("math_attempts")
    .select("id").eq("id", attemptId).eq("user_id", userId).maybeSingle();
  fail(error, "驗證解題紀錄擁有權");
  return data ? String(data.id) : undefined;
}

export async function markAttemptAsMistake(input: { userId: string; attemptId: string; markedWrong: boolean; mistakeNote?: string }) {
  const { data, error } = await supabase().from("math_attempts")
    .update({
      student_marked_wrong: input.markedWrong,
      student_mistake_note: input.markedWrong && input.mistakeNote?.trim() ? input.mistakeNote.trim() : null,
      student_marked_wrong_at: input.markedWrong ? new Date().toISOString() : null,
    })
    .eq("id", input.attemptId).eq("user_id", input.userId)
    .select("id, student_marked_wrong, student_mistake_note, student_marked_wrong_at")
    .maybeSingle();
  fail(error, "更新錯題標記");
  return data ? {
    id: String(data.id), studentMarkedWrong: Boolean(data.student_marked_wrong),
    studentMistakeNote: data.student_mistake_note ?? null, studentMarkedWrongAt: data.student_marked_wrong_at ?? null,
  } : undefined;
}

export async function getMarkedAttemptForPractice(userId: string, attemptId: string) {
  const { data, error } = await supabase().from("math_attempts")
    .select("id, response_json")
    .eq("id", attemptId).eq("user_id", userId).eq("student_marked_wrong", true)
    .maybeSingle();
  fail(error, "讀取標記錯題");
  if (!data) return undefined;
  const response = typeof data.response_json === "string" ? safeJsonParse(data.response_json) : data.response_json;
  const variationQuestion = response && typeof response === "object" && typeof (response as Record<string, unknown>).variationQuestion === "string"
    ? (response as Record<string, string>).variationQuestion.trim().slice(0, 2000)
    : "";
  return variationQuestion ? { id: String(data.id), variationQuestion } : undefined;
}

function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return undefined; }
}

export async function savePracticeResult(input: { userId: string; sourceAttemptId: string; question: string; studentAnswer?: string; status: "not_attempted" | "correct" | "incorrect" | "needs_review" }) {
  const { data, error } = await supabase().from("practice_results").insert({
    user_id: input.userId, source_attempt_id: input.sourceAttemptId, question: input.question,
    student_answer: input.studentAnswer ?? null, status: input.status,
  }).select("id").single();
  fail(error, "保存變式練習");
  return String(data.id);
}

export async function listPracticeHistory(userId: string) {
  const { data, error } = await supabase().from("practice_results")
    .select("id, source_attempt_id, question, student_answer, status, created_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(30);
  fail(error, "讀取變式練習");
  return (data ?? []).map((row: any) => ({
    id: String(row.id), sourceAttemptId: String(row.source_attempt_id), question: row.question,
    studentAnswer: row.student_answer, status: row.status, createdAt: row.created_at,
  }));
}

export async function createEscalation(input: { userId: string; attemptId: string; reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern"; detail?: string; priority: string; notificationDelivered: boolean }) {
  const { data, error } = await supabase().from("teacher_escalations").insert({
    user_id: input.userId, attempt_id: input.attemptId, reason: input.reason, detail: input.detail ?? null,
    priority: input.priority, notification_delivered: input.notificationDelivered,
  }).select("id").single();
  fail(error, "保存學生回報案件");
  return String(data.id);
}

export async function listEscalations() {
  const { data, error } = await supabase().from("teacher_escalations")
    .select("id, attempt_id, reason, detail, priority, status, notification_delivered, created_at")
    .order("created_at", { ascending: false }).limit(50);
  fail(error, "讀取學生回報案件");
  return (data ?? []).map((row: any) => ({
    id: String(row.id), attemptId: String(row.attempt_id), reason: row.reason, detail: row.detail,
    priority: row.priority, status: row.status, notificationDelivered: row.notification_delivered,
    createdAt: row.created_at,
  }));
}

export async function updateEscalationStatus(input: { id: string; status: "new" | "reviewing" | "resolved" }) {
  const { error } = await supabase().from("teacher_escalations").update({ status: input.status }).eq("id", input.id);
  fail(error, "更新學生回報案件");
}
