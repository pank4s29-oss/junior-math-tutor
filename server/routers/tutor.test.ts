import { beforeEach, describe, expect, it, vi } from "vitest";

const UUIDS = {
  appUser: "11111111-1111-4111-8111-111111111111", attachment: "22222222-2222-4222-8222-222222222222",
  conversation: "33333333-3333-4333-8333-333333333333", attempt: "44444444-4444-4444-8444-444444444444",
  practice: "55555555-5555-4555-8555-555555555555", escalation: "66666666-6666-4666-8666-666666666666",
  unit: "77777777-7777-4777-8777-777777777777", content: "88888888-8888-4888-8888-888888888888",
};

const mocks = vi.hoisted(() => ({
  generateGeminiJson: vi.fn(), getOrCreateAppUser: vi.fn(), assertSupabaseAdmin: vi.fn(), consumeSolveQuota: vi.fn(), refundSolveQuota: vi.fn(), uploadMathPhoto: vi.fn(), getAttachmentForUser: vi.fn(), downloadMathPhoto: vi.fn(), updateAttachmentRecognition: vi.fn(), createConversation: vi.fn(), getConversationForUser: vi.fn(), createMathAttempt: vi.fn(), listRecentAttempts: vi.fn(), buildLearningInsights: vi.fn(), buildPracticeSheet: vi.fn(), listPracticeHistory: vi.fn(), getAttemptForUser: vi.fn(), markAttemptAsMistake: vi.fn(), getMarkedAttemptForPractice: vi.fn(), savePracticeResult: vi.fn(), createEscalation: vi.fn(), listEscalations: vi.fn(), updateEscalationStatus: vi.fn(), getTutorContext: vi.fn(), listApprovedStudentUnits: vi.fn(), getApprovedStudentUnit: vi.fn(), listApprovedTutorModes: vi.fn(), getApprovedTutorMode: vi.fn(), getTeacherUnitByKey: vi.fn(), getTeacherTutorMode: vi.fn(), ensureTeacherUnitForContent: vi.fn(), listTeacherUnits: vi.fn(), listTeacherContents: vi.fn(), listTeacherTutorModes: vi.fn(), listTeacherMaterials: vi.fn(), upsertTeacherTutorMode: vi.fn(), upsertTeacherUnit: vi.fn(), addApprovedContent: vi.fn(), uploadTeacherMaterial: vi.fn(), getBatchQuestionLimit: vi.fn(), updateBatchQuestionLimit: vi.fn(), createBatchSession: vi.fn(), getBatchSessionForUser: vi.fn(), linkAttachmentConversationIfMissing: vi.fn(), listAttachmentsForUser: vi.fn(), renameAttachment: vi.fn(), updateAttachmentTranscriptionForUser: vi.fn(), deleteAttachmentForUser: vi.fn(), listQuotaRefundFailures: vi.fn(), resolveQuotaRefundFailure: vi.fn(),
  consumePracticeQuota: vi.fn(), refundPracticeQuota: vi.fn(), createPracticeQuestion: vi.fn(), claimPracticeQuestionFromBank: vi.fn(), getPracticeQuestionBankPoolCounts: vi.fn(), listRecentBankQuestionTexts: vi.fn(),
  generatePracticeQuestionWithRetry: vi.fn(), refillPracticeQuestionBank: vi.fn(),
}));

vi.mock("../tutor/gemini", () => ({
  GEMINI_TUTOR_MODEL: "gemini-3.6-flash",
  generateGeminiJson: mocks.generateGeminiJson,
  GeminiTemporaryUnavailableError: class GeminiTemporaryUnavailableError extends Error {
    retryAfterSeconds?: number;
    constructor(retryAfterSeconds?: number) {
      super(retryAfterSeconds ? `解題服務暫時繁忙，請在約 ${retryAfterSeconds} 秒後再試。` : "解題服務暫時繁忙，請稍候再試。");
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
}));
vi.mock("../tutor/supabaseDb", () => ({ getOrCreateAppUser: mocks.getOrCreateAppUser, assertSupabaseAdmin: mocks.assertSupabaseAdmin, consumeSolveQuota: mocks.consumeSolveQuota, refundSolveQuota: mocks.refundSolveQuota, uploadMathPhoto: mocks.uploadMathPhoto, getAttachmentForUser: mocks.getAttachmentForUser, downloadMathPhoto: mocks.downloadMathPhoto, updateAttachmentRecognition: mocks.updateAttachmentRecognition, createConversation: mocks.createConversation, getConversationForUser: mocks.getConversationForUser, createMathAttempt: mocks.createMathAttempt, listRecentAttempts: mocks.listRecentAttempts, buildLearningInsights: mocks.buildLearningInsights, buildPracticeSheet: mocks.buildPracticeSheet, listPracticeHistory: mocks.listPracticeHistory, getAttemptForUser: mocks.getAttemptForUser, markAttemptAsMistake: mocks.markAttemptAsMistake, getMarkedAttemptForPractice: mocks.getMarkedAttemptForPractice, savePracticeResult: mocks.savePracticeResult, createEscalation: mocks.createEscalation, listEscalations: mocks.listEscalations, updateEscalationStatus: mocks.updateEscalationStatus, createBatchSession: mocks.createBatchSession, getBatchSessionForUser: mocks.getBatchSessionForUser, linkAttachmentConversationIfMissing: mocks.linkAttachmentConversationIfMissing, listAttachmentsForUser: mocks.listAttachmentsForUser, renameAttachment: mocks.renameAttachment, updateAttachmentTranscriptionForUser: mocks.updateAttachmentTranscriptionForUser, deleteAttachmentForUser: mocks.deleteAttachmentForUser, listQuotaRefundFailures: mocks.listQuotaRefundFailures, resolveQuotaRefundFailure: mocks.resolveQuotaRefundFailure, consumePracticeQuota: mocks.consumePracticeQuota, refundPracticeQuota: mocks.refundPracticeQuota, createPracticeQuestion: mocks.createPracticeQuestion, claimPracticeQuestionFromBank: mocks.claimPracticeQuestionFromBank, getPracticeQuestionBankPoolCounts: mocks.getPracticeQuestionBankPoolCounts, listRecentBankQuestionTexts: mocks.listRecentBankQuestionTexts }));
vi.mock("../tutor/supabaseTeacherDb", () => ({ getTutorContext: mocks.getTutorContext, listApprovedStudentUnits: mocks.listApprovedStudentUnits, getApprovedStudentUnit: mocks.getApprovedStudentUnit, listApprovedTutorModes: mocks.listApprovedTutorModes, getApprovedTutorMode: mocks.getApprovedTutorMode, getTeacherUnitByKey: mocks.getTeacherUnitByKey, getTeacherTutorMode: mocks.getTeacherTutorMode, ensureTeacherUnitForContent: mocks.ensureTeacherUnitForContent, listTeacherUnits: mocks.listTeacherUnits, listTeacherContents: mocks.listTeacherContents, listTeacherTutorModes: mocks.listTeacherTutorModes, listTeacherMaterials: mocks.listTeacherMaterials, upsertTeacherTutorMode: mocks.upsertTeacherTutorMode, upsertTeacherUnit: mocks.upsertTeacherUnit, addApprovedContent: mocks.addApprovedContent, uploadTeacherMaterial: mocks.uploadTeacherMaterial, getBatchQuestionLimit: mocks.getBatchQuestionLimit, updateBatchQuestionLimit: mocks.updateBatchQuestionLimit }));
vi.mock("../tutor/practiceGeneration", () => ({ generatePracticeQuestionWithRetry: mocks.generatePracticeQuestionWithRetry }));
vi.mock("../tutor/practiceQuestionBank", () => ({ refillPracticeQuestionBank: mocks.refillPracticeQuestionBank }));

import { tutorRouter, validatePhotoDataUrl } from "./tutor";

const student = { id: 12, openId: "student-12", name: "Test Student", email: "student@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const readySolution = { status: "ready", confidence: 92, needsClarification: false, clarificationQuestion: "", problemRestatement: "解 3x - 7 = 11。", keyConcepts: ["等量公理"], steps: [{ title: "加回 7", reason: "等式兩邊同加 7", work: "3x = 18" }], verification: "代入 x = 6，原式成立。", commonMistakes: ["移項符號要改變"], errorTags: ["移項符號"], variationQuestion: "試試看：4x + 5 = 21。", safetyNote: "AI 可能出錯；重要答案請再次驗算。" };
const caller = () => tutorRouter.createCaller({ user: student } as never);
const adminCaller = () => tutorRouter.createCaller({ user: { ...student, role: "admin" as const } } as never);
const teacherCaller = () => tutorRouter.createCaller({ user: { ...student, role: "teacher" as const } } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrCreateAppUser.mockResolvedValue({ id: UUIDS.appUser, role: "student" }); mocks.assertSupabaseAdmin.mockResolvedValue({ id: UUIDS.appUser, role: "admin" }); mocks.consumeSolveQuota.mockResolvedValue({ allowed: true, remaining: 18 }); mocks.getTutorContext.mockResolvedValue({ rules: "先問學生已知條件。", contents: [] }); mocks.listApprovedStudentUnits.mockResolvedValue([]); mocks.listApprovedTutorModes.mockResolvedValue([{ key: "guided", name: "引導解題", description: "先提示" }]); mocks.getApprovedStudentUnit.mockResolvedValue(undefined); mocks.getApprovedTutorMode.mockResolvedValue({ modeKey: "guided", name: "引導解題", teachingInstructions: "先給下一步提示，並保留完整安全格式。", isApproved: true }); mocks.getTeacherUnitByKey.mockResolvedValue(undefined); mocks.createConversation.mockResolvedValue(UUIDS.conversation); mocks.createMathAttempt.mockResolvedValue(UUIDS.attempt); mocks.generateGeminiJson.mockResolvedValue(JSON.stringify(readySolution)); mocks.buildLearningInsights.mockReturnValue({ recentCount: 1, frequentCount: 1, topTags: [{ tag: "移項符號", count: 1 }], recommendation: "先重做。", nextSteps: ["重做"] }); mocks.buildPracticeSheet.mockReturnValue("# 練習單");
  mocks.getAttemptForUser.mockResolvedValue(UUIDS.attempt);
  mocks.consumePracticeQuota.mockResolvedValue({ allowed: true, remaining: 29 });
  mocks.claimPracticeQuestionFromBank.mockResolvedValue(undefined);
  mocks.createPracticeQuestion.mockResolvedValue({ id: UUIDS.practice, createdAt: "2026-09-03T00:00:00.000Z" });
  mocks.generatePracticeQuestionWithRetry.mockResolvedValue({ ok: true, generation: { question: "解 $x$", keyConcept: "移項", difficultyNote: "單一步驟。" }, extras: [] });
  mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue([{ grade: "seven", unitKey: "linear-equations", difficulty: "intro", availableCount: 4 }]);
  mocks.listRecentBankQuestionTexts.mockResolvedValue([]);
  mocks.refillPracticeQuestionBank.mockResolvedValue({ combinationsChecked: 36, combinationsBelowTarget: 0, questionsGenerated: 0, questionsFailed: 0, timedOut: false, elapsedMs: 5 });
  mocks.markAttemptAsMistake.mockResolvedValue({ id: UUIDS.attempt, studentMarkedWrong: true, studentMistakeNote: "移項符號", studentMarkedWrongAt: "2026-08-27T00:00:00.000Z" });
  mocks.getMarkedAttemptForPractice.mockResolvedValue({ id: UUIDS.attempt, variationQuestion: readySolution.variationQuestion });
  mocks.ensureTeacherUnitForContent.mockResolvedValue(UUIDS.unit);
  mocks.getConversationForUser.mockResolvedValue(UUIDS.conversation); mocks.getBatchQuestionLimit.mockResolvedValue(5); mocks.createBatchSession.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", questionCount: 2, maxQuestions: 5, status: "active" }); mocks.getBatchSessionForUser.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", grade: "seven", unitKey: "linear-equations", questionCount: 2, maxQuestions: 5, status: "active" });
});

describe("Supabase 國中數學解題路由", () => {
  it("建立多題工作階段時採用教師設定上限並保存學生本人", async () => {
    mocks.getBatchQuestionLimit.mockResolvedValue(10);
    mocks.createBatchSession.mockResolvedValueOnce({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", questionCount: 8, maxQuestions: 10, status: "active" });
    const result = await caller().startBatchSession({ grade: "seven", unitKey: "linear-equations", questionCount: 8 });
    expect(mocks.createBatchSession).toHaveBeenCalledWith({ userId: UUIDS.appUser, grade: "seven", unitKey: "linear-equations", questionCount: 8, maxQuestions: 10 });
    expect(result.maxQuestions).toBe(10);
  });
  it("多題工作階段單元不符時拒絕解題且不呼叫模型", async () => {
    mocks.getBatchSessionForUser.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", grade: "seven", unitKey: "ratio-geometry", questionCount: 2, maxQuestions: 5, status: "active" });
    await expect(caller().solve({ question: "求 x", grade: "seven", unitKey: "linear-equations", mode: "guided", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).rejects.toThrow("單元與目前選擇不符");
    expect(mocks.generateGeminiJson).not.toHaveBeenCalled();
  });
  it("僅把資料層已篩選的核准自訂單元合併到學生課綱，並保留核心單元順序", async () => {
    mocks.listApprovedStudentUnits.mockResolvedValue([{ grade: "seven", key: "probability-tree", label: "樹狀圖與條件機率" }, { grade: "eight", key: "polynomials", label: "多項式進階" }]);
    const result = await caller().curriculum();
    expect(result.units.seven.map(unit => unit.key)).toEqual(["integer-number-line", "exponents-scientific", "linear-equations", "ratio-geometry", "probability-tree"]);
    expect(result.units.seven.at(-1)).toEqual({ key: "probability-tree", label: "樹狀圖與條件機率" });
    expect(result.units.eight.find(unit => unit.key === "polynomials")).toEqual({ key: "polynomials", label: "多項式進階" });
  });
  it("接受安全圖片與小型 PDF 資料，並拒絕格式偽裝", () => { expect(validatePhotoDataUrl("data:image/png;base64,aGVsbG8=", "image/png").toString()).toBe("hello"); expect(validatePhotoDataUrl("data:application/pdf;base64,aGVsbG8=", "application/pdf").toString()).toBe("hello"); expect(() => validatePhotoDataUrl("data:image/gif;base64,aGVsbG8=", "image/png")).toThrow("JPEG、PNG、WebP 或 PDF"); });
  it("在沒有題目或照片時拒絕模型呼叫", async () => { await expect(caller().solve({ question: "", grade: "seven", unitKey: "linear-equations", mode: "guided" })).rejects.toThrow("請輸入題目"); expect(mocks.generateGeminiJson).not.toHaveBeenCalled(); });
  it("拒絕未核准的自訂單元，且不耗用學生解題額度", async () => {
    await expect(caller().solve({ question: "求 x", grade: "seven", unitKey: "draft-probability", mode: "guided" })).rejects.toThrow("尚未核准");
    expect(mocks.getApprovedStudentUnit).toHaveBeenCalledWith("seven", "draft-probability");
    expect(mocks.consumeSolveQuota).not.toHaveBeenCalled();
  });
  it("核准的自訂單元可解題，且採用受資料庫控制的名稱與規則", async () => {
    mocks.getApprovedStudentUnit.mockResolvedValue({ grade: "seven", key: "probability-tree", label: "樹狀圖與條件機率" });
    mocks.getTutorContext.mockResolvedValue({ name: "樹狀圖與條件機率", rules: "先畫樹狀圖，再說明相依關係。", contents: [] });
    await expect(caller().solve({ question: "抽球機率", grade: "seven", unitKey: "probability-tree", mode: "guided" })).resolves.toMatchObject({ attemptId: UUIDS.attempt });
    expect(mocks.getTutorContext).toHaveBeenCalledWith("seven", "probability-tree");
  });
  it("以 Supabase UUID 保存對話與結構化解題", async () => { const result = await caller().solve({ question: "3x - 7 = 11", grade: "seven", unitKey: "linear-equations", mode: "step_by_step" }); expect(mocks.getOrCreateAppUser).toHaveBeenCalledWith(student); expect(mocks.createConversation).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser })); expect(mocks.createMathAttempt).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser, conversationId: UUIDS.conversation })); expect(result).toMatchObject({ attemptId: UUIDS.attempt, conversationId: UUIDS.conversation, remaining: 18 }); });
  it("模型暫時失敗時退還本次解題額度，且不保存半成品紀錄", async () => {
    mocks.generateGeminiJson.mockRejectedValueOnce(new Error("解題服務暫時繁忙，請在約 10 秒後再試。題目不需要重新上傳。"));
    await expect(caller().solve({ question: "3x - 7 = 11", grade: "seven", unitKey: "linear-equations", mode: "guided" })).rejects.toThrow("解題服務暫時繁忙");
    expect(mocks.refundSolveQuota).toHaveBeenCalledWith(UUIDS.appUser);
    expect(mocks.createMathAttempt).not.toHaveBeenCalled();
  });
  it("把題目照片上傳與附件參照交由 Supabase Storage", async () => { mocks.uploadMathPhoto.mockResolvedValue({ attachmentId: UUIDS.attachment, storagePath: `${UUIDS.appUser}/q.png` }); const result = await caller().uploadPhoto({ filename: "題目.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" }); expect(mocks.uploadMathPhoto).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser, bytes: expect.any(Buffer) })); expect(result).toEqual({ attachmentId: UUIDS.attachment, recognitionStatus: "pending" }); });
  it("讀取私有照片位元組，低信心時標示需補拍", async () => { mocks.getAttachmentForUser.mockResolvedValue({ id: UUIDS.attachment, storagePath: "private/photo.png", mimeType: "image/png" }); mocks.downloadMathPhoto.mockResolvedValue({ data: "aGVsbG8=", mimeType: "image/png" }); mocks.generateGeminiJson.mockResolvedValue(JSON.stringify({ isReadable: false, confidence: 40, transcription: "2x + [不清楚]", clarification: "請補拍。", cropHint: "保留等號。" })); const result = await caller().recognizePhoto({ attachmentId: UUIDS.attachment }); expect(mocks.downloadMathPhoto).toHaveBeenCalledWith("private/photo.png", "image/png"); expect(mocks.updateAttachmentRecognition).toHaveBeenCalledWith(UUIDS.attachment, "unclear", "2x + [不清楚]"); expect(result.isReadable).toBe(false); });
  it("辨識是送出前輔助步驟，不耗用解題額度或冷卻；隨後解題才計次", async () => {
    mocks.getAttachmentForUser.mockResolvedValue({ id: UUIDS.attachment, storagePath: "private/photo.png", mimeType: "image/png" });
    mocks.downloadMathPhoto.mockResolvedValue({ data: "aGVsbG8=", mimeType: "image/png" });
    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify({ isReadable: true, confidence: 94, transcription: "3x - 7 = 11", clarification: "", cropHint: "" }));
    const recognition = await caller().recognizePhoto({ attachmentId: UUIDS.attachment });
    expect(recognition).toMatchObject({ isReadable: true, remaining: null });
    expect(mocks.consumeSolveQuota).not.toHaveBeenCalled();

    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify(readySolution));
    await expect(caller().solve({ question: "3x - 7 = 11", grade: "seven", unitKey: "linear-equations", mode: "guided", attachmentId: UUIDS.attachment })).resolves.toMatchObject({ attemptId: UUIDS.attempt });
    expect(mocks.consumeSolveQuota).toHaveBeenCalledTimes(1);
  });
  it("附件已第一次解題後，追問同一附件不帶 conversationId 也能自動延續同一對話（修復第 13 題遺失情境）", async () => {
    mocks.getAttachmentForUser.mockResolvedValue({
      id: UUIDS.attachment, storagePath: "private/worksheet.png", mimeType: "image/png",
      transcription: "第1題：3x-7=11\n...\n第13題：解 2x+5=17", conversationId: UUIDS.conversation,
    });
    mocks.downloadMathPhoto.mockResolvedValue({ data: "aGVsbG8=", mimeType: "image/png" });
    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify(readySolution));

    const result = await caller().solve({
      question: "請講解第13題", grade: "seven", unitKey: "linear-equations", mode: "guided", attachmentId: UUIDS.attachment,
    });

    // 沒有傳 conversationId，但因為附件已經綁定了先前的對話，仍應延續同一個 conversation，
    // 而不是另外開一個新對話（開新對話等於 AI 徹底忘記先前上傳過的圖片與文字）。
    expect(mocks.getConversationForUser).toHaveBeenCalledWith(UUIDS.appUser, UUIDS.conversation);
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ conversationId: UUIDS.conversation });

    const prompt = mocks.generateGeminiJson.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain("第13題：解 2x+5=17");

    expect(mocks.linkAttachmentConversationIfMissing).toHaveBeenCalledWith(UUIDS.attachment, UUIDS.conversation);
  });
  it("附件第一次解題成功後，會把新建立的對話與附件綁定，供後續追問延續", async () => {
    mocks.getAttachmentForUser.mockResolvedValue({ id: UUIDS.attachment, storagePath: "private/photo.png", mimeType: "image/png" });
    mocks.downloadMathPhoto.mockResolvedValue({ data: "aGVsbG8=", mimeType: "image/png" });
    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify(readySolution));
    await caller().solve({ question: "3x - 7 = 11", grade: "seven", unitKey: "linear-equations", mode: "guided", attachmentId: UUIDS.attachment });
    expect(mocks.linkAttachmentConversationIfMissing).toHaveBeenCalledWith(UUIDS.attachment, UUIDS.conversation);
  });
  it("上傳紀錄：可列出、重新命名、編輯辨識文字並刪除本人附件", async () => {
    mocks.listAttachmentsForUser.mockResolvedValue([{ id: UUIDS.attachment, filename: "第一頁.png", mimeType: "image/png", recognitionStatus: "readable", transcription: "3x-7=11", conversationId: UUIDS.conversation, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" }]);
    await expect(caller().listAttachments()).resolves.toEqual([expect.objectContaining({ id: UUIDS.attachment, filename: "第一頁.png" })]);

    await caller().renameAttachment({ attachmentId: UUIDS.attachment, filename: "第一頁（訂正）" });
    expect(mocks.renameAttachment).toHaveBeenCalledWith(UUIDS.appUser, UUIDS.attachment, "第一頁（訂正）");

    await caller().updateAttachmentTranscription({ attachmentId: UUIDS.attachment, transcription: "3x - 7 = 11（已確認）" });
    expect(mocks.updateAttachmentTranscriptionForUser).toHaveBeenCalledWith(UUIDS.appUser, UUIDS.attachment, "3x - 7 = 11（已確認）");

    await caller().deleteAttachment({ attachmentId: UUIDS.attachment });
    expect(mocks.deleteAttachmentForUser).toHaveBeenCalledWith(UUIDS.appUser, UUIDS.attachment);
  });
  it("不允許學生 A 讀取或引用學生 B 的私有附件、解題、練習與案件", async () => { const studentB = { ...student, id: 13, openId: "student-13", email: "student-b@example.com" }; const otherId = "99999999-9999-4999-8999-999999999999"; mocks.getOrCreateAppUser.mockImplementation(async (user: { id: number }) => ({ id: user.id === 12 ? UUIDS.appUser : otherId, role: "student" })); mocks.getAttachmentForUser.mockResolvedValue(undefined); mocks.getAttemptForUser.mockResolvedValue(undefined); const studentBCaller = tutorRouter.createCaller({ user: studentB } as never); await expect(studentBCaller.recognizePhoto({ attachmentId: UUIDS.attachment })).rejects.toThrow("找不到這張題目照片"); await expect(studentBCaller.savePractice({ sourceAttemptId: UUIDS.attempt, question: "他人的題目", status: "incorrect" })).rejects.toThrow("找不到這筆解題紀錄"); await expect(studentBCaller.reportConcern({ attemptId: UUIDS.attempt, reason: "wrong_answer" })).rejects.toThrow("找不到這筆解題紀錄"); expect(mocks.downloadMathPhoto).not.toHaveBeenCalled(); expect(mocks.savePracticeResult).not.toHaveBeenCalled(); expect(mocks.createEscalation).not.toHaveBeenCalled(); });
  it("不允許學生 A 以學生 B 的 conversationId 延續解題", async () => { const studentB = { ...student, id: 13, openId: "student-13", email: "student-b@example.com" }; mocks.getConversationForUser.mockResolvedValue(undefined); await expect(tutorRouter.createCaller({ user: studentB } as never).solve({ question: "x + 2 = 8", grade: "seven", unitKey: "linear-equations", mode: "guided", conversationId: UUIDS.conversation })).rejects.toThrow("找不到這個解題對話"); expect(mocks.generateGeminiJson).not.toHaveBeenCalled(); expect(mocks.createMathAttempt).not.toHaveBeenCalled(); });
  it("保存變式練習與教師協助案件至 Supabase", async () => { mocks.savePracticeResult.mockResolvedValue(UUIDS.practice); mocks.createEscalation.mockResolvedValue(UUIDS.escalation); await expect(caller().savePractice({ sourceAttemptId: UUIDS.attempt, question: "4x + 5 = 21", studentAnswer: "x=4", status: "correct" })).resolves.toBe(UUIDS.practice); await expect(caller().reportConcern({ attemptId: UUIDS.attempt, reason: "teacher_help" })).resolves.toEqual({ escalationId: UUIDS.escalation, notified: false }); expect(mocks.createEscalation).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser, attemptId: UUIDS.attempt, notificationDelivered: false })); });
  it("學生可標記自己的常犯錯題並從標記題目建立二次變式練習", async () => {
    mocks.savePracticeResult.mockResolvedValue(UUIDS.practice);
    await expect(caller().markMistake({ attemptId: UUIDS.attempt, markedWrong: true, mistakeNote: "移項時忘記變號" })).resolves.toMatchObject({ studentMarkedWrong: true });
    expect(mocks.markAttemptAsMistake).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser, attemptId: UUIDS.attempt, markedWrong: true }));
    await expect(caller().createMarkedPractice({ attemptId: UUIDS.attempt })).resolves.toEqual({ practiceId: UUIDS.practice, question: readySolution.variationQuestion });
    expect(mocks.savePracticeResult).toHaveBeenCalledWith(expect.objectContaining({ userId: UUIDS.appUser, sourceAttemptId: UUIDS.attempt, status: "not_attempted" }));
  });
  it("不允許以他人紀錄建立錯題標記或二次練習", async () => {
    const studentB = { ...student, id: 13, openId: "student-13", email: "student-b@example.com" };
    mocks.getOrCreateAppUser.mockResolvedValue({ id: "99999999-9999-4999-8999-999999999999", role: "student" });
    mocks.markAttemptAsMistake.mockResolvedValue(undefined);
    mocks.getMarkedAttemptForPractice.mockResolvedValue(undefined);
    const otherCaller = tutorRouter.createCaller({ user: studentB } as never);
    await expect(otherCaller.markMistake({ attemptId: UUIDS.attempt, markedWrong: true })).rejects.toThrow("找不到這筆解題紀錄");
    await expect(otherCaller.createMarkedPractice({ attemptId: UUIDS.attempt })).rejects.toThrow("請先把這筆紀錄標記");
  });
  it("管理者讀取與更新 Supabase 教師資料，非管理者會被拒絕", async () => { mocks.listTeacherUnits.mockResolvedValue([{ id: UUIDS.unit }]); mocks.listTeacherContents.mockResolvedValue([{ id: UUIDS.content }]); mocks.listEscalations.mockResolvedValue([{ id: UUIDS.escalation }]); const admin = adminCaller(); await expect(admin.teacher.listUnits()).resolves.toHaveLength(1); await expect(admin.teacher.listContents()).resolves.toHaveLength(1); await expect(admin.teacher.listEscalations()).resolves.toHaveLength(1); await expect(admin.teacher.updateEscalationStatus({ id: UUIDS.escalation, status: "resolved" })).resolves.toBeUndefined(); expect(mocks.assertSupabaseAdmin).toHaveBeenCalled(); await expect(caller().teacher.listUnits()).rejects.toThrow(); });
  it("教師可管理單元，但新增自訂代碼遇到同年級重複項目時會被拒絕", async () => {
    mocks.getTeacherUnitByKey.mockResolvedValue({ id: UUIDS.unit, grade: "seven", unitKey: "probability-tree" });
    await expect(teacherCaller().teacher.upsertUnit({ grade: "seven", unitKey: "probability-tree", name: "樹狀圖", teachingRules: "先確認抽取順序與是否放回，再逐支標示機率並核對所有分支總和。", isApproved: false, createOnly: true })).rejects.toThrow("已有相同單元代碼");
    expect(mocks.upsertTeacherUnit).not.toHaveBeenCalled();
  });
  it("教師可將教材精確歸屬到指定核心或自訂單元", async () => {
    mocks.addApprovedContent.mockResolvedValue(UUIDS.content);
    await expect(teacherCaller().teacher.addApprovedContent({ grade: "seven", unitKey: "linear-equations", unitName: "一元一次方程式", type: "example", title: "移項練習", body: "先把未知數項留在等號左邊，常數項移到右邊，再逐步驗算答案。", isApproved: true })).resolves.toBe(UUIDS.content);
    expect(mocks.ensureTeacherUnitForContent).toHaveBeenCalledWith({ grade: "seven", unitKey: "linear-equations", name: "一元一次方程式" });
    expect(mocks.addApprovedContent).toHaveBeenCalledWith(expect.objectContaining({ unitId: UUIDS.unit, type: "example" }));
  });
  it("學生只讀取核准模式，且未核准模式在耗用額度前被拒絕", async () => {
    await expect(caller().solutionModes()).resolves.toEqual({ modes: [{ key: "guided", name: "引導解題", description: "先提示" }] });
    mocks.getApprovedTutorMode.mockResolvedValue(undefined);
    await expect(caller().solve({ question: "解方程式", grade: "seven", unitKey: "linear-equations", mode: "draft-flow" })).rejects.toThrow("模式尚未核准");
    expect(mocks.consumeSolveQuota).not.toHaveBeenCalled();
  });
  it("教師可建立核准的解題模式與依單元上傳私有文字教材", async () => {
    mocks.upsertTeacherTutorMode.mockResolvedValue("mode-id"); mocks.uploadTeacherMaterial.mockResolvedValue("material-id");
    await expect(teacherCaller().teacher.upsertMode({ modeKey: "exam-review", name: "考前複習", description: "用題目整理觀念", teachingInstructions: "先檢查學生已知條件，再以最少步驟提供提示，最後完整說明驗算與容易忽略的地方。", isApproved: true, createOnly: true })).resolves.toBe("mode-id");
    await expect(teacherCaller().teacher.uploadMaterial({ grade: "seven", unitKey: "linear-equations", unitName: "一元一次方程式", title: "重點講義", filename: "重點.txt", mimeType: "text/plain", dataUrl: "data:text/plain;base64,5paw5pWZ5p2Q5YaF5a65", isApproved: true })).resolves.toBe("material-id");
    expect(mocks.uploadTeacherMaterial).toHaveBeenCalledWith(expect.objectContaining({ unitId: UUIDS.unit, mimeType: "text/plain", bytes: expect.any(Buffer) }));
  });
  it("只從目前學生資料產生學習建議與兩種練習單", async () => {
    mocks.listRecentAttempts.mockResolvedValue([{ id: UUIDS.attempt, questionText: "3x=9", unitKey: "linear-equations", studentMarkedWrong: true, errorTags: "[\"移項符號\"]" }]);
    await expect(caller().learningInsights()).resolves.toMatchObject({ frequentCount: 1 });
    const frequentDocx = await caller().exportPracticeSheet({ source: "frequent", format: "docx" });
    expect(frequentDocx).toMatchObject({ filename: "常犯錯題練習單.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(typeof frequentDocx.base64).toBe("string");
    expect(frequentDocx.base64.length).toBeGreaterThan(0);
    const recentPdf = await caller().exportPracticeSheet({ source: "recent", format: "pdf" });
    expect(recentPdf).toMatchObject({ filename: "近期學習紀錄練習單.pdf", mimeType: "application/pdf" });
    expect(typeof recentPdf.base64).toBe("string");
    expect(recentPdf.base64.length).toBeGreaterThan(0);
    expect(mocks.listRecentAttempts).toHaveBeenCalledWith(UUIDS.appUser);
  });
  it("題庫命中時直接領取題目，秒回不呼叫 Gemini", async () => {
    mocks.claimPracticeQuestionFromBank.mockResolvedValue({ id: "bank-item-1", questionText: "解 $2x+5=17$", keyConcept: "移項", difficultyNote: "單一步驟。", model: "gemini-3.6-flash" });
    const result = await caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" });
    expect(result).toMatchObject({ practiceQuestionId: UUIDS.practice, question: "解 $2x+5=17$", remaining: 29 });
    expect(mocks.claimPracticeQuestionFromBank).toHaveBeenCalledWith({ grade: "seven", unitKey: "linear-equations", difficulty: "intro", userId: UUIDS.appUser });
    expect(mocks.createPracticeQuestion).toHaveBeenCalledWith(expect.objectContaining({ source: "bank", questionText: "解 $2x+5=17$" }));
    expect(mocks.generatePracticeQuestionWithRetry).not.toHaveBeenCalled();
    expect(mocks.consumePracticeQuota).toHaveBeenCalledTimes(1);
  });
  it("題庫領到的題目帶有洩漏草稿（例如反覆猶豫 \\le／\\ne 的中文草稿）時，捨棄該題並退回即時生成，不會把壞掉的內容存給學生", async () => {
    mocks.claimPracticeQuestionFromBank.mockResolvedValue({
      id: "bank-item-corrupted", questionText: "已知 $A=2^{20}$，其中$1\num \\ne 10改為1\node 不對，再檢查：答案是 5$", keyConcept: "科學記號", difficultyNote: "單一步驟。", model: "gemini-3.6-flash",
    });
    const result = await caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" });
    expect(result).toMatchObject({ practiceQuestionId: UUIDS.practice, question: "解 $x$", remaining: 29 });
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(1);
    expect(mocks.createPracticeQuestion).toHaveBeenCalledWith(expect.objectContaining({ source: "live" }));
    expect(mocks.createPracticeQuestion).not.toHaveBeenCalledWith(expect.objectContaining({ source: "bank" }));
  });
  it("題庫用盡時退回即時呼叫 Gemini 補題", async () => {
    mocks.claimPracticeQuestionFromBank.mockResolvedValue(undefined);
    const result = await caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" });
    expect(result).toMatchObject({ practiceQuestionId: UUIDS.practice, question: "解 $x$", remaining: 29 });
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(1);
    expect(mocks.createPracticeQuestion).toHaveBeenCalledWith(expect.objectContaining({ source: "live" }));
  });
  it("題庫查詢本身失敗時記錄後仍退回即時生成，不擋住學生出題", async () => {
    mocks.claimPracticeQuestionFromBank.mockRejectedValueOnce(new Error("從練習題庫領取題目失敗：連線逾時"));
    const result = await caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" });
    expect(result).toMatchObject({ practiceQuestionId: UUIDS.practice });
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(1);
  });
  it("即時生成也失敗時退還出題額度並回報錯誤", async () => {
    mocks.claimPracticeQuestionFromBank.mockResolvedValue(undefined);
    mocks.generatePracticeQuestionWithRetry.mockResolvedValue({ ok: false });
    await expect(caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" })).rejects.toThrow("出題服務暫時無法完成");
    expect(mocks.refundPracticeQuota).toHaveBeenCalledWith(UUIDS.appUser);
    expect(mocks.createPracticeQuestion).not.toHaveBeenCalled();
  });
  it("即時生成拋出例外時退還出題額度並讓例外原樣往外傳", async () => {
    mocks.claimPracticeQuestionFromBank.mockResolvedValue(undefined);
    mocks.generatePracticeQuestionWithRetry.mockRejectedValue(new Error("解題服務暫時繁忙，請在約 10 秒後再試。"));
    await expect(caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" })).rejects.toThrow("解題服務暫時繁忙");
    expect(mocks.refundPracticeQuota).toHaveBeenCalledWith(UUIDS.appUser);
  });
  it("出題額度已用完時直接拒絕，不查詢題庫也不呼叫 Gemini", async () => {
    mocks.consumePracticeQuota.mockResolvedValue({ allowed: false, remaining: 0, message: "今日出題額度已用完。" });
    await expect(caller().generatePractice({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" })).rejects.toThrow("今日出題額度已用完");
    expect(mocks.claimPracticeQuestionFromBank).not.toHaveBeenCalled();
    expect(mocks.generatePracticeQuestionWithRetry).not.toHaveBeenCalled();
  });
  it("管理者可查詢題庫庫存並手動觸發補題，非管理者被拒絕", async () => {
    const admin = adminCaller();
    await expect(admin.teacher.listPracticeQuestionBankStats()).resolves.toEqual([{ grade: "seven", unitKey: "linear-equations", difficulty: "intro", availableCount: 4 }]);
    await expect(admin.teacher.refillPracticeQuestionBank()).resolves.toMatchObject({ questionsGenerated: 0 });
    expect(mocks.refillPracticeQuestionBank).toHaveBeenCalledWith({ timeBudgetMs: 45_000 });
    await expect(caller().teacher.listPracticeQuestionBankStats()).rejects.toThrow();
  });
});
