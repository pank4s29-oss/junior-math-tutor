import { and, asc, desc, eq } from "drizzle-orm";
import {
  approvedContents,
  dailyUsage,
  mathAttachments,
  mathAttempts,
  mathConversations,
  practiceResults,
  teacherEscalations,
  teacherUnits,
} from "../../drizzle/schema";
import type { Grade, TutorMode } from "../../shared/mathCurriculum";
import { getDb } from "../db";

const DAILY_LIMIT = 20;
const REQUEST_COOLDOWN_MS = 3500;

export function evaluateSolveQuota(
  record: { requestCount: number; lastRequestedAt: Date } | undefined,
  now: Date,
) {
  if (!record) return { allowed: true, remaining: DAILY_LIMIT - 1, nextRequestCount: 1 };
  const elapsed = now.getTime() - record.lastRequestedAt.getTime();
  if (elapsed < REQUEST_COOLDOWN_MS) {
    return { allowed: false, remaining: Math.max(0, DAILY_LIMIT - record.requestCount), nextRequestCount: record.requestCount, message: "請稍候幾秒再送出，讓我完整整理上一題。" };
  }
  if (record.requestCount >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, nextRequestCount: record.requestCount, message: "你今天的解題額度已用完，明天再繼續練習，或先回顧錯題本。" };
  }
  return { allowed: true, remaining: DAILY_LIMIT - record.requestCount - 1, nextRequestCount: record.requestCount + 1 };
}

function getInsertId(result: unknown) {
  const first = Array.isArray(result) ? result[0] : result;
  return Number((first as { insertId?: number | bigint })?.insertId ?? 0);
}

export async function consumeSolveQuota(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");

  const now = new Date();
  const usageDate = now.toISOString().slice(0, 10);
  const existing = await db.select().from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, usageDate))).limit(1);
  const record = existing[0];

  const decision = evaluateSolveQuota(record, now);
  if (!decision.allowed) return decision;
  if (record) {
    await db.update(dailyUsage).set({ requestCount: decision.nextRequestCount, lastRequestedAt: now })
      .where(eq(dailyUsage.id, record.id));
    return decision;
  }

  await db.insert(dailyUsage).values({ userId, usageDate, requestCount: 1, lastRequestedAt: now });
  return decision;
}

export async function getTutorContext(grade: Grade, unitKey: string) {
  const db = await getDb();
  if (!db) return { rules: "", contents: [] as Array<{ title: string; body: string; type: string }> };

  const units = await db.select().from(teacherUnits)
    .where(and(eq(teacherUnits.grade, grade), eq(teacherUnits.unitKey, unitKey), eq(teacherUnits.isApproved, true))).limit(1);
  const unit = units[0];
  if (!unit) return { rules: "", contents: [] as Array<{ title: string; body: string; type: string }> };

  const contents = await db.select({ title: approvedContents.title, body: approvedContents.body, type: approvedContents.type })
    .from(approvedContents)
    .where(and(eq(approvedContents.unitId, unit.id), eq(approvedContents.isApproved, true)))
    .limit(8);
  return { rules: unit.teachingRules, contents };
}

export async function createConversation(input: { userId: number; title: string; grade: Grade; unitKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(mathConversations).values(input);
  return getInsertId(result);
}

export async function createMathAttempt(input: {
  userId: number; conversationId: number; grade: Grade; unitKey: string; mode: TutorMode;
  questionText: string; attachmentId?: number; responseMarkdown: string; responseJson: string;
  confidence: number; needsClarification: boolean; errorTags: string; model: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(mathAttempts).values({ ...input, attachmentId: input.attachmentId ?? null });
  return getInsertId(result);
}

export async function createMathAttachment(input: {
  userId: number; storageKey: string; storageUrl: string; originalName: string; mimeType: string; byteSize: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(mathAttachments).values(input);
  return getInsertId(result);
}

export async function getAttachmentForUser(userId: number, attachmentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(mathAttachments)
    .where(and(eq(mathAttachments.id, attachmentId), eq(mathAttachments.userId, userId))).limit(1);
  return rows[0];
}

export async function updateAttachmentRecognition(attachmentId: number, status: "readable" | "unclear") {
  const db = await getDb();
  if (!db) return;
  await db.update(mathAttachments).set({ recognitionStatus: status }).where(eq(mathAttachments.id, attachmentId));
}

export async function listRecentAttempts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: mathAttempts.id, questionText: mathAttempts.questionText, unitKey: mathAttempts.unitKey,
    mode: mathAttempts.mode, confidence: mathAttempts.confidence, errorTags: mathAttempts.errorTags,
    needsClarification: mathAttempts.needsClarification, createdAt: mathAttempts.createdAt,
  }).from(mathAttempts).where(eq(mathAttempts.userId, userId)).orderBy(desc(mathAttempts.createdAt)).limit(10);
}

export async function listPracticeHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: practiceResults.id,
    sourceAttemptId: practiceResults.sourceAttemptId,
    question: practiceResults.question,
    studentAnswer: practiceResults.studentAnswer,
    status: practiceResults.status,
    createdAt: practiceResults.createdAt,
  }).from(practiceResults).where(eq(practiceResults.userId, userId)).orderBy(desc(practiceResults.updatedAt)).limit(30);
}

export async function savePracticeResult(input: { userId: number; sourceAttemptId: number; question: string; studentAnswer?: string; status: "not_attempted" | "correct" | "incorrect" | "needs_review" }) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(practiceResults).values({ ...input, studentAnswer: input.studentAnswer ?? null });
  return getInsertId(result);
}

export async function createEscalation(input: {
  userId: number; attemptId: number; reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern";
  detail?: string; priority: string; notificationDelivered: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(teacherEscalations).values({ ...input, detail: input.detail ?? null });
  return getInsertId(result);
}

export async function upsertTeacherUnit(input: {
  grade: Grade; unitKey: string; name: string; teachingRules: string; isApproved: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const current = await db.select().from(teacherUnits)
    .where(and(eq(teacherUnits.grade, input.grade), eq(teacherUnits.unitKey, input.unitKey))).limit(1);
  if (current[0]) {
    await db.update(teacherUnits).set({
      name: input.name, teachingRules: input.teachingRules, isApproved: input.isApproved, version: current[0].version + 1,
    }).where(eq(teacherUnits.id, current[0].id));
    return current[0].id;
  }
  const result = await db.insert(teacherUnits).values(input);
  return getInsertId(result);
}

export async function addApprovedContent(input: {
  unitId: number; type: "concept" | "example" | "misconception" | "rubric"; title: string; body: string; isApproved: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  const result = await db.insert(approvedContents).values(input);
  return getInsertId(result);
}

export async function listEscalations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(teacherEscalations).orderBy(desc(teacherEscalations.createdAt)).limit(50);
}

export async function listTeacherUnits() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(teacherUnits).orderBy(asc(teacherUnits.grade), asc(teacherUnits.unitKey));
}

export async function listTeacherContents() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: approvedContents.id,
    unitId: approvedContents.unitId,
    type: approvedContents.type,
    title: approvedContents.title,
    body: approvedContents.body,
    isApproved: approvedContents.isApproved,
    version: approvedContents.version,
    unitName: teacherUnits.name,
    grade: teacherUnits.grade,
  }).from(approvedContents)
    .leftJoin(teacherUnits, eq(approvedContents.unitId, teacherUnits.id))
    .orderBy(desc(approvedContents.updatedAt))
    .limit(80);
}

export async function updateEscalationStatus(input: { id: number; status: "new" | "reviewing" | "resolved" }) {
  const db = await getDb();
  if (!db) throw new Error("資料服務目前無法使用，請稍後再試。");
  await db.update(teacherEscalations).set({ status: input.status }).where(eq(teacherEscalations.id, input.id));
}
