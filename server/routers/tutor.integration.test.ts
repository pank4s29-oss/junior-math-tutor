import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { dailyUsage, mathAttachments, mathAttempts, mathConversations, practiceResults } from "../../drizzle/schema";
import { getDb } from "../db";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("../storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));

import { tutorRouter } from "./tutor";

const testUserId = 9_070_001;
const user = {
  id: testUserId,
  openId: "integration-test-student",
  name: "Integration Test Student",
  email: "integration@example.com",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const readySolution = {
  status: "ready",
  confidence: 88,
  needsClarification: false,
  clarificationQuestion: "",
  problemRestatement: "解 2x + 3 = 13。",
  keyConcepts: ["等量公理"],
  steps: [{ title: "先減 3", reason: "等式兩邊同減 3", work: "2x = 10" }],
  verification: "代入 x = 5，左邊等於 13。",
  commonMistakes: ["忘記兩邊同時運算"],
  errorTags: ["移項符號"],
  variationQuestion: "試試看：3x - 2 = 10。",
  safetyNote: "AI 可能出錯；重要答案請再次驗算。",
};

async function cleanTestRows() {
  const db = await getDb();
  if (!db) throw new Error("整合測試需要資料庫連線。");
  await db.delete(practiceResults).where(eq(practiceResults.userId, testUserId));
  await db.delete(mathAttempts).where(eq(mathAttempts.userId, testUserId));
  await db.delete(mathAttachments).where(eq(mathAttachments.userId, testUserId));
  await db.delete(mathConversations).where(eq(mathConversations.userId, testUserId));
  await db.delete(dailyUsage).where(eq(dailyUsage.userId, testUserId));
}

describe("國中數學解題資料流程整合", () => {
  beforeEach(async () => {
    await cleanTestRows();
    vi.clearAllMocks();
    mocks.storagePut.mockResolvedValue({ key: "9070001/math-problems/integration.png", url: "/manus-storage/9070001/math-problems/integration.png" });
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example/integration.png");
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(readySolution) } }] });
  });

  afterEach(async () => {
    await cleanTestRows();
  });

  it("保存題目照片參照、解題紀錄、附件辨識狀態與變式練習結果", async () => {
    const caller = tutorRouter.createCaller({ user } as never);
    const upload = await caller.uploadPhoto({
      filename: "equation.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
    });

    const solution = await caller.solve({
      question: "請解 2x + 3 = 13",
      grade: "seven",
      unitKey: "linear-equations",
      mode: "step_by_step",
      attachmentId: upload.attachmentId,
    });

    const db = await getDb();
    if (!db) throw new Error("整合測試需要資料庫連線。");
    const attachment = await db.select().from(mathAttachments).where(eq(mathAttachments.id, upload.attachmentId)).limit(1);
    const attempt = await db.select().from(mathAttempts).where(eq(mathAttempts.id, solution.attemptId)).limit(1);
    const conversation = await db.select().from(mathConversations).where(eq(mathConversations.id, solution.conversationId)).limit(1);

    expect(attachment[0]).toMatchObject({ userId: testUserId, storageKey: "9070001/math-problems/integration.png", recognitionStatus: "readable" });
    expect(attempt[0]).toMatchObject({ userId: testUserId, conversationId: solution.conversationId, attachmentId: upload.attachmentId, confidence: 88, model: "claude-sonnet-4-6" });
    expect(conversation[0]).toMatchObject({ userId: testUserId, grade: "seven", unitKey: "linear-equations" });

    await expect(caller.savePractice({ sourceAttemptId: solution.attemptId, question: solution.solution.variationQuestion, studentAnswer: "x = 4", status: "correct" })).resolves.toBeGreaterThan(0);
    await expect(caller.practiceHistory()).resolves.toEqual([expect.objectContaining({ question: "試試看：3x - 2 = 10。", studentAnswer: "x = 4", status: "correct" })]);
  });

  it("將低信心的照片題目保存為需補拍狀態", async () => {
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ ...readySolution, status: "clarification", confidence: 35, needsClarification: true, clarificationQuestion: "請補拍完整題目與等號右邊。" }) } }] });
    const caller = tutorRouter.createCaller({ user } as never);
    const upload = await caller.uploadPhoto({ filename: "blur.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" });
    const solution = await caller.solve({ question: "", grade: "seven", unitKey: "linear-equations", mode: "guided", attachmentId: upload.attachmentId });

    const db = await getDb();
    if (!db) throw new Error("整合測試需要資料庫連線。");
    const attachment = await db.select().from(mathAttachments).where(eq(mathAttachments.id, upload.attachmentId)).limit(1);
    expect(solution.solution).toMatchObject({ needsClarification: true, confidence: 35 });
    expect(attachment[0]?.recognitionStatus).toBe("unclear");
  });
});
