import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateGeminiJson: vi.fn() }));
vi.mock("./gemini", () => ({
  generateGeminiJson: mocks.generateGeminiJson,
  GeminiTemporaryUnavailableError: class GeminiTemporaryUnavailableError extends Error {
    retryAfterSeconds?: number;
    constructor(retryAfterSeconds?: number) {
      super(retryAfterSeconds ? `解題服務暫時繁忙，請在約 ${retryAfterSeconds} 秒後再試。` : "解題服務暫時繁忙，請稍候再試。");
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
}));

import { GeminiTemporaryUnavailableError } from "./gemini";
import { generatePracticeQuestionWithRetry } from "./practiceGeneration";

const target = {
  grade: "seven" as const, unitKey: "linear-equations", unitLabel: "一元一次方程式", difficulty: "intro" as const,
  teacherRules: "先確認學生已知條件。", approvedContext: [],
};

const cleanGeneration = { question: "解 $3x - 7 = 11$，求 $x$。", keyConcept: "移項與等量公理", difficultyNote: "單一步驟即可求解。" };
const cleanExtra1 = { question: "解 $2x + 5 = 17$，求 $x$。", keyConcept: "移項與等量公理", difficultyNote: "單一步驟即可求解。" };
const cleanExtra2 = { question: "解 $5x - 4 = 21$，求 $x$。", keyConcept: "移項與等量公理", difficultyNote: "單一步驟即可求解。" };

// generatePracticeQuestionWithRetry 底層改呼叫批次版 Gemini schema，一次要求
// QUESTIONS_PER_CALL 題（見 practiceGeneration.ts），所以這裡的 mock 回傳值
// 用 `{ questions: [...] }` 這個外殼包住多題，才能真實反映
// parsePracticeGenerationBatch 的輸入格式，也才能驗證 extras 有正確被回傳。
const cleanGenerationBatch = JSON.stringify({ questions: [cleanGeneration, cleanExtra1, cleanExtra2] });
const leakedDraftBatch = (question: string) => JSON.stringify({ questions: [{ question, keyConcept: "", difficultyNote: "" }] });

describe("generatePracticeQuestionWithRetry", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("第一次呼叫就乾淨可用時直接回傳，不重試，同批其餘乾淨題目一併以 extras 回傳", async () => {
    mocks.generateGeminiJson.mockResolvedValueOnce(cleanGenerationBatch);
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration, extras: [cleanExtra1, cleanExtra2] });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(1);
  });

  it("內容殘缺（洩漏思考草稿）時自動重試，直到拿到乾淨內容", async () => {
    mocks.generateGeminiJson
      .mockResolvedValueOnce(leakedDraftBatch("Wait, let's fix this. $x$"))
      .mockResolvedValueOnce(cleanGenerationBatch);
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration, extras: [cleanExtra1, cleanExtra2] });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(2);
  });

  it("同一批裡第一題乾淨、其餘題目殘缺時，extras 只保留乾淨的那些", async () => {
    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify({
      questions: [cleanGeneration, { question: "Wait, let's fix. $x$", keyConcept: "", difficultyNote: "" }, cleanExtra2],
    }));
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration, extras: [cleanExtra2] });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(1);
  });

  it("連續三次都產生殘缺內容時，回報失敗而不是把殘缺內容交給呼叫端", async () => {
    mocks.generateGeminiJson.mockResolvedValue(leakedDraftBatch("Wait, let's fix. $x$"));
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: false });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(3);
  });

  it("時間預算不足以再試一次時提早收手，不會超過時間預算硬呼叫 Gemini", async () => {
    vi.useFakeTimers();
    try {
      mocks.generateGeminiJson.mockImplementation(async () => {
        vi.advanceTimersByTime(9_000); // 模擬單次 Gemini 呼叫本身就耗掉大部分時間預算。
        return leakedDraftBatch("Wait, let's fix. $x$");
      });
      const outcome = await generatePracticeQuestionWithRetry(target, { timeBudgetMs: 9_500 });
      expect(outcome).toEqual({ ok: false });
      // 時間預算只夠一次嘗試（第二次嘗試前剩餘時間會低於 MIN_ATTEMPT_BUDGET_MS）。
      expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Gemini 呼叫本身拋出例外時原樣往外傳，不吞掉錯誤", async () => {
    mocks.generateGeminiJson.mockRejectedValueOnce(new Error("解題服務暫時繁忙，請在約 10 秒後再試。"));
    await expect(generatePracticeQuestionWithRetry(target)).rejects.toThrow("解題服務暫時繁忙");
  });

  it("撞到 429 這類暫時性錯誤時會退避後重試，而不是第一次就放棄（這是這次修正的核心行為）", async () => {
    mocks.generateGeminiJson
      .mockRejectedValueOnce(new GeminiTemporaryUnavailableError(0))
      .mockResolvedValueOnce(cleanGenerationBatch);
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration, extras: [cleanExtra1, cleanExtra2] });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(2);
  });

  it("暫時性錯誤連續發生到用盡重試次數，才把錯誤往外拋", async () => {
    mocks.generateGeminiJson.mockRejectedValue(new GeminiTemporaryUnavailableError(0));
    await expect(generatePracticeQuestionWithRetry(target)).rejects.toThrow("解題服務暫時繁忙");
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(3);
  });

  it("非暫時性錯誤（例如金鑰未設定）不會白白浪費重試次數，第一次就直接往外拋", async () => {
    mocks.generateGeminiJson.mockRejectedValueOnce(new Error("Gemini 解題服務尚未設定。"));
    await expect(generatePracticeQuestionWithRetry(target)).rejects.toThrow("尚未設定");
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(1);
  });
});
