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

/** 僅在已通過本次額度檢查、但尚未成功取得模型回覆時退還一次計次。 */
export async function refundSolveQuota(userId: string) {
  const { error } = await supabase().rpc("refund_tutor_quota", { p_user_id: userId });
  fail(error, "退還暫時失敗的解題額度");
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

type LearningAttemptSummaryRow = Awaited<ReturnType<typeof listRecentAttempts>>[number];

function parseErrorTags(value: string): string[] {
  try { return Array.isArray(JSON.parse(value)) ? JSON.parse(value).map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 8) : []; }
  catch { return [] as string[]; }
}

/** 僅依本人保存的解題紀錄產生提示，不傳送學生內容到模型或其他服務。 */
export function buildLearningInsights(attempts: LearningAttemptSummaryRow[]) {
  const frequent = attempts.filter(item => item.studentMarkedWrong);
  const tagCounts = new Map<string, number>();
  frequent.forEach(item => parseErrorTags(item.errorTags).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)));
  const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag, count]) => ({ tag, count }));
  const unitCounts = new Map<string, number>();
  frequent.forEach(item => unitCounts.set(item.unitKey, (unitCounts.get(item.unitKey) ?? 0) + 1));
  const focusUnit = Array.from(unitCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const recommendation = frequent.length === 0
    ? "目前還沒有標記的常犯錯題。完成一題後，請主動標示真正容易錯的地方，系統才能整理出更貼近你的練習方向。"
    : topTags.length
      ? `你已標記 ${frequent.length} 題常犯錯題，最常出現的是「${topTags[0].tag}」。建議先挑 2 題重做，逐步說出每一步理由，再用代回或合理性檢查驗算。`
      : `你已標記 ${frequent.length} 題常犯錯題。建議在每題補上一句容易錯的原因，接著選 2 題建立二次練習並記錄訂正步驟。`;
  return {
    recentCount: attempts.length, frequentCount: frequent.length, topTags, focusUnit: focusUnit ?? null, recommendation,
    nextSteps: frequent.length ? ["先重做一題常犯錯題，不看先前解答。", "完成後比較每一步與原先的錯誤原因。", "用二次變式練習確認是否真正理解。"] : ["完成一題目前單元的練習。", "若有卡關或答案不確定，標記為常犯錯題。", "寫下錯誤原因，讓下一次複習更有方向。"],
  };
}

/** 產生僅供目前學生下載的 Markdown 練習單，不包含模型回覆、照片或其他使用者資料。 */
export function buildPracticeSheet(attempts: LearningAttemptSummaryRow[], source: "frequent" | "recent") {
  const rows = (source === "frequent" ? attempts.filter(item => item.studentMarkedWrong) : attempts).slice(0, 20);
  const title = source === "frequent" ? "常犯錯題練習單" : "近期學習紀錄練習單";
  const items = rows.map((item, index) => `## ${index + 1}. ${item.unitKey}\n\n${item.questionText}\n\n我的作法：\n\n＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿\n\n驗算／檢查：\n\n＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿`).join("\n\n---\n\n");
  return `# ${title}\n\n請先獨立作答，再逐步寫下理由與驗算。這份練習單僅包含你自己的題幹，不含解答、照片或其他同學資料。\n\n${items || "目前沒有可匯出的題目。"}\n`;
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

export function validateBatchQuestionCount(questionCount: number, maxQuestions: number) {
  return Number.isInteger(questionCount) && questionCount >= 1 && (maxQuestions === 5 || maxQuestions === 10) && questionCount <= maxQuestions;
}

export async function createBatchSession(input: { userId: string; grade: Grade; unitKey: string; questionCount: number; maxQuestions: number }) {
  if (!validateBatchQuestionCount(input.questionCount, input.maxQuestions)) {
    throw new Error("這批題目超過目前允許的處理上限。");
  }
  const { data, error } = await supabase().from("tutor_batch_sessions").insert({
    user_id: input.userId, grade: input.grade, unit_key: input.unitKey,
    question_count: input.questionCount, max_questions: input.maxQuestions, status: "active",
  }).select("id, question_count, max_questions, status").single();
  fail(error, "建立多題解題工作階段");
  return { id: String(data.id), questionCount: Number(data.question_count), maxQuestions: Number(data.max_questions), status: String(data.status) };
}

export async function getBatchSessionForUser(userId: string, sessionId: string) {
  const { data, error } = await supabase().from("tutor_batch_sessions")
    .select("id, user_id, grade, unit_key, question_count, max_questions, status")
    .eq("id", sessionId).eq("user_id", userId).maybeSingle();
  fail(error, "驗證多題工作階段擁有權");
  if (!data) return undefined;
  return { id: String(data.id), grade: data.grade as Grade, unitKey: String(data.unit_key), questionCount: Number(data.question_count), maxQuestions: Number(data.max_questions), status: String(data.status) };
}

export async function completeBatchSession(userId: string, sessionId: string) {
  const { error } = await supabase().from("tutor_batch_sessions")
    .update({ status: "completed" }).eq("id", sessionId).eq("user_id", userId);
  fail(error, "完成多題解題工作階段");
}
