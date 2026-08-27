import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const gradeLevel = mysqlEnum("gradeLevel", ["seven", "eight", "nine"]);
export const tutorMode = mysqlEnum("tutorMode", ["guided", "step_by_step", "check"]);
export const attachmentStatus = mysqlEnum("attachmentStatus", ["pending", "readable", "unclear", "rejected"]);
export const contentType = mysqlEnum("contentType", ["concept", "example", "misconception", "rubric"]);
export const practiceStatus = mysqlEnum("practiceStatus", ["not_attempted", "correct", "incorrect", "needs_review"]);
export const escalationReason = mysqlEnum("escalationReason", ["wrong_answer", "unclear_photo", "teacher_help", "safety_concern"]);
export const escalationStatus = mysqlEnum("escalationStatus", ["new", "reviewing", "resolved"]);

/** Teacher-configurable mathematics units and their approved tutoring rules. */
export const teacherUnits = mysqlTable("teacherUnits", {
  id: int("id").autoincrement().primaryKey(),
  grade: gradeLevel.notNull(),
  unitKey: varchar("unitKey", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  teachingRules: text("teachingRules").notNull(),
  isApproved: boolean("isApproved").default(false).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("teacher_unit_grade_key_unique").on(table.grade, table.unitKey),
]);

/** Small, versioned knowledge records that the tutor may cite as approved context. */
export const approvedContents = mysqlTable("approvedContents", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  type: contentType.notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  isApproved: boolean("isApproved").default(false).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("approved_content_unit_idx").on(table.unitId)]);

export const mathConversations = mysqlTable("mathConversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  grade: gradeLevel.notNull(),
  unitKey: varchar("unitKey", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("math_conversation_user_idx").on(table.userId)]);

/** Only object-storage references are stored here; binary file data remains in S3. */
export const mathAttachments = mysqlTable("mathAttachments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  byteSize: int("byteSize").notNull(),
  recognitionStatus: attachmentStatus.default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("math_attachment_user_idx").on(table.userId)]);

export const mathAttempts = mysqlTable("mathAttempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId").notNull(),
  grade: gradeLevel.notNull(),
  unitKey: varchar("unitKey", { length: 80 }).notNull(),
  mode: tutorMode.notNull(),
  questionText: text("questionText").notNull(),
  attachmentId: int("attachmentId"),
  responseMarkdown: text("responseMarkdown").notNull(),
  responseJson: text("responseJson").notNull(),
  confidence: int("confidence").notNull(),
  needsClarification: boolean("needsClarification").default(false).notNull(),
  errorTags: text("errorTags").notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("math_attempt_user_idx").on(table.userId),
  index("math_attempt_conversation_idx").on(table.conversationId),
]);

export const practiceResults = mysqlTable("practiceResults", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceAttemptId: int("sourceAttemptId").notNull(),
  question: text("question").notNull(),
  studentAnswer: text("studentAnswer"),
  status: practiceStatus.default("not_attempted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("practice_result_user_idx").on(table.userId)]);

export const teacherEscalations = mysqlTable("teacherEscalations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  attemptId: int("attemptId").notNull(),
  reason: escalationReason.notNull(),
  detail: text("detail"),
  priority: varchar("priority", { length: 20 }).default("standard").notNull(),
  status: escalationStatus.default("new").notNull(),
  notificationDelivered: boolean("notificationDelivered").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("teacher_escalation_status_idx").on(table.status)]);

/** Database-backed limits remain effective even when the application autos-scales. */
export const dailyUsage = mysqlTable("dailyUsage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  usageDate: varchar("usageDate", { length: 10 }).notNull(),
  requestCount: int("requestCount").default(0).notNull(),
  lastRequestedAt: timestamp("lastRequestedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("daily_usage_user_date_unique").on(table.userId, table.usageDate),
]);
