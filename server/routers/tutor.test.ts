import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyOwner: vi.fn(),
  invokeLLM: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  createEscalation: vi.fn(),
  consumeSolveQuota: vi.fn(),
  createConversation: vi.fn(),
  createMathAttempt: vi.fn(),
  createMathAttachment: vi.fn(),
  getAttachmentForUser: vi.fn(),
  getTutorContext: vi.fn(),
  listPracticeHistory: vi.fn(),
  listRecentAttempts: vi.fn(),
  savePracticeResult: vi.fn(),
  updateAttachmentRecognition: vi.fn(),
  upsertTeacherUnit: vi.fn(),
  addApprovedContent: vi.fn(),
  listEscalations: vi.fn(),
  listTeacherUnits: vi.fn(),
  listTeacherContents: vi.fn(),
  updateEscalationStatus: vi.fn(),
}));

vi.mock("../_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("../storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));
vi.mock("../tutor/db", () => ({
  createEscalation: mocks.createEscalation,
  consumeSolveQuota: mocks.consumeSolveQuota,
  createConversation: mocks.createConversation,
  createMathAttempt: mocks.createMathAttempt,
  createMathAttachment: mocks.createMathAttachment,
  getAttachmentForUser: mocks.getAttachmentForUser,
  getTutorContext: mocks.getTutorContext,
  listPracticeHistory: mocks.listPracticeHistory,
  listRecentAttempts: mocks.listRecentAttempts,
  savePracticeResult: mocks.savePracticeResult,
  updateAttachmentRecognition: mocks.updateAttachmentRecognition,
  upsertTeacherUnit: mocks.upsertTeacherUnit,
  addApprovedContent: mocks.addApprovedContent,
  listEscalations: mocks.listEscalations,
  listTeacherUnits: mocks.listTeacherUnits,
  listTeacherContents: mocks.listTeacherContents,
  updateEscalationStatus: mocks.updateEscalationStatus,
}));

import { tutorRouter, validatePhotoDataUrl } from "./tutor";

const user = {
  id: 12,
  openId: "student-12",
  name: "Test Student",
  email: "student@example.com",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const completeSolution = {
  status: "ready",
  confidence: 92,
  needsClarification: false,
  clarificationQuestion: "",
  problemRestatement: "解 3x - 7 = 11。",
  keyConcepts: ["等量公理"],
  steps: [{ title: "加回 7", reason: "等式兩邊同加 7", work: "3x = 18" }],
  verification: "代入 x = 6，原式成立。",
  commonMistakes: ["移項符號要改變"],
  errorTags: ["移項符號"],
  variationQuestion: "試試看：4x + 5 = 21。",
  safetyNote: "AI 可能出錯；重要答案請再次驗算。",
};

function caller() {
  return tutorRouter.createCaller({ user } as never);
}

function teacherCaller() {
  return tutorRouter.createCaller({ user: { ...user, role: "admin" as const } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeSolveQuota.mockResolvedValue({ allowed: true, remaining: 18 });
  mocks.getTutorContext.mockResolvedValue({ rules: "先問學生已知條件。", contents: [] });
  mocks.createConversation.mockResolvedValue(51);
  mocks.createMathAttempt.mockResolvedValue(61);
  mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(completeSolution) } }] });
});

describe("題目照片驗證與受控解題路由", () => {
  it("接受安全且格式正確的小型 PNG 資料", () => {
    const bytes = validatePhotoDataUrl("data:image/png;base64,aGVsbG8=", "image/png");
    expect(bytes.toString()).toBe("hello");
  });

  it("拒絕格式偽裝與不支援的圖片資料", () => {
    expect(() => validatePhotoDataUrl("data:image/gif;base64,aGVsbG8=", "image/png")).toThrow("JPEG、PNG 或 WebP");
    expect(() => validatePhotoDataUrl("not-a-data-url", "image/jpeg")).toThrow("JPEG、PNG 或 WebP");
  });

  it("在沒有題目或照片時拒絕模型呼叫", async () => {
    await expect(caller().solve({ question: "", grade: "seven", unitKey: "linear-equations", mode: "guided" }))
      .rejects.toThrow("請輸入題目，或上傳一張清楚的題目照片");
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("完成文字題解題，建立對話、保存嘗試並回傳固定結構", async () => {
    const result = await caller().solve({ question: "3x - 7 = 11", grade: "seven", unitKey: "linear-equations", mode: "step_by_step" });

    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-4-6", response_format: expect.any(Object) }));
    expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({ grade: "seven", unitKey: "linear-equations" }));
    expect(mocks.createMathAttempt).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 51, confidence: 92, model: "claude-sonnet-4-6" }));
    expect(result).toMatchObject({ attemptId: 61, conversationId: 51, remaining: 18 });
    expect(result.responseMarkdown).toContain("## 題意");
    expect(result.responseMarkdown).toContain("## 驗算與檢查");
  });

  it("以照片題目低信心回覆時，將附件標示為需補拍", async () => {
    mocks.getAttachmentForUser.mockResolvedValue({ storageKey: "student-12/math-problems/photo.png" });
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example/problem.png");
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ ...completeSolution, status: "clarification", confidence: 42, needsClarification: true, clarificationQuestion: "請補拍含完整等號與題幹的照片。" }) } }] });

    const result = await caller().solve({ question: "", grade: "seven", unitKey: "linear-equations", mode: "guided", attachmentId: 9 });

    expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith("student-12/math-problems/photo.png");
    expect(mocks.updateAttachmentRecognition).toHaveBeenCalledWith(9, "unclear");
    expect(result.solution).toMatchObject({ needsClarification: true, confidence: 42 });
  });

  it("產生可編輯的手寫題目轉寫稿，並在低信心時標示照片不清楚", async () => {
    mocks.getAttachmentForUser.mockResolvedValue({ storageKey: "student-12/math-problems/handwriting.png" });
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example/handwriting.png");
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ isReadable: false, confidence: 53, transcription: "2x + [不清楚] = 13", clarification: "請補拍等號右邊。", cropHint: "保留完整題幹與等號右側。" }) } }] });

    const result = await caller().recognizePhoto({ attachmentId: 14 });

    expect(result).toMatchObject({ isReadable: false, confidence: 53, transcription: "2x + [不清楚] = 13" });
    expect(mocks.updateAttachmentRecognition).toHaveBeenCalledWith(14, "unclear");
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-4-6", response_format: expect.any(Object) }));
  });

  it("將安全照片存入物件儲存並只保存檔案參照", async () => {
    mocks.storagePut.mockResolvedValue({ key: "12/math-problems/q_a1.png", url: "/manus-storage/12/math-problems/q_a1.png" });
    mocks.createMathAttachment.mockResolvedValue(77);
    const result = await caller().uploadPhoto({ filename: "我的題目.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" });

    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringContaining("12/math-problems/"), expect.any(Buffer), "image/png");
    expect(mocks.createMathAttachment).toHaveBeenCalledWith(expect.objectContaining({ userId: 12, storageKey: "12/math-problems/q_a1.png", byteSize: 5 }));
    expect(result).toEqual({ attachmentId: 77, url: "/manus-storage/12/math-problems/q_a1.png", recognitionStatus: "pending" });
  });

  it("保存並讀回變式練習結果", async () => {
    mocks.savePracticeResult.mockResolvedValue(73);
    mocks.listPracticeHistory.mockResolvedValue([{ id: 73, question: "4x + 5 = 21", status: "correct" }]);
    await expect(caller().savePractice({ sourceAttemptId: 61, question: "4x + 5 = 21", studentAnswer: "x = 4", status: "correct" })).resolves.toBe(73);
    await expect(caller().practiceHistory()).resolves.toEqual([{ id: 73, question: "4x + 5 = 21", status: "correct" }]);
    expect(mocks.savePracticeResult).toHaveBeenCalledWith(expect.objectContaining({ userId: 12, sourceAttemptId: 61 }));
  });

  it("將教師協助請求寫入品質檢查流程並發出管理者通知", async () => {
    mocks.notifyOwner.mockResolvedValue(true);
    mocks.createEscalation.mockResolvedValue(43);
    const result = await caller().reportConcern({ attemptId: 8, reason: "teacher_help", detail: "我已嘗試兩次，仍不理解移項。" });

    expect(mocks.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ title: "國中數學解題需要教師協助" }));
    expect(mocks.createEscalation).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 8, priority: "high", notificationDelivered: true }));
    expect(result).toEqual({ escalationId: 43, notified: true });
  });

  it("允許管理者讀取、儲存教材規則與更新案件狀態", async () => {
    mocks.listTeacherUnits.mockResolvedValue([{ id: 1, grade: "seven", unitKey: "linear-equations" }]);
    mocks.listTeacherContents.mockResolvedValue([{ id: 3, title: "移項觀念" }]);
    mocks.listEscalations.mockResolvedValue([{ id: 7, status: "new" }]);
    mocks.upsertTeacherUnit.mockResolvedValue(1);
    mocks.addApprovedContent.mockResolvedValue(3);
    const admin = teacherCaller();

    await expect(admin.teacher.listUnits()).resolves.toHaveLength(1);
    await expect(admin.teacher.listContents()).resolves.toHaveLength(1);
    await expect(admin.teacher.listEscalations()).resolves.toHaveLength(1);
    await expect(admin.teacher.upsertUnit({ grade: "seven", unitKey: "linear-equations", name: "一元一次方程式", teachingRules: "先辨認未知數，再提醒等式兩邊必須保持平衡，最後一定要代回原式驗算。", isApproved: true })).resolves.toBe(1);
    await expect(admin.teacher.addApprovedContent({ unitId: 1, type: "concept", title: "等量公理", body: "等式兩邊同時加、減、乘、除同一個非零數，等式依然成立。", isApproved: true })).resolves.toBe(3);
    await expect(admin.teacher.updateEscalationStatus({ id: 7, status: "resolved" })).resolves.toBeUndefined();
    expect(mocks.updateEscalationStatus).toHaveBeenCalledWith({ id: 7, status: "resolved" });
  });
});
