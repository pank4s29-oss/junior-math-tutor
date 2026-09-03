import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateGeminiJson: vi.fn() }));
vi.mock("./gemini", () => ({ generateGeminiJson: mocks.generateGeminiJson }));

import { generatePracticeQuestionWithRetry } from "./practiceGeneration";

const target = {
  grade: "seven" as const, unitKey: "linear-equations", unitLabel: "一元一次方程式", difficulty: "intro" as const,
  teacherRules: "先確認學生已知條件。", approvedContext: [],
};

const cleanGeneration = { question: "解 $3x - 7 = 11$，求 $x$。", keyConcept: "移項與等量公理", difficultyNote: "單一步驟即可求解。" };

describe("generatePracticeQuestionWithRetry", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("第一次呼叫就乾淨可用時直接回傳，不重試", async () => {
    mocks.generateGeminiJson.mockResolvedValueOnce(JSON.stringify(cleanGeneration));
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(1);
  });

  it("內容殘缺（洩漏思考草稿）時自動重試，直到拿到乾淨內容", async () => {
    mocks.generateGeminiJson
      .mockResolvedValueOnce(JSON.stringify({ question: "Wait, let's fix this. $x$", keyConcept: "", difficultyNote: "" }))
      .mockResolvedValueOnce(JSON.stringify(cleanGeneration));
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: true, generation: cleanGeneration });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(2);
  });

  it("連續三次都產生殘缺內容時，回報失敗而不是把殘缺內容交給呼叫端", async () => {
    mocks.generateGeminiJson.mockResolvedValue(JSON.stringify({ question: "Wait, let's fix. $x$", keyConcept: "", difficultyNote: "" }));
    const outcome = await generatePracticeQuestionWithRetry(target);
    expect(outcome).toEqual({ ok: false });
    expect(mocks.generateGeminiJson).toHaveBeenCalledTimes(3);
  });

  it("時間預算不足以再試一次時提早收手，不會超過時間預算硬呼叫 Gemini", async () => {
    vi.useFakeTimers();
    try {
      mocks.generateGeminiJson.mockImplementation(async () => {
        vi.advanceTimersByTime(9_000); // 模擬單次 Gemini 呼叫本身就耗掉大部分時間預算。
        return JSON.stringify({ question: "Wait, let's fix. $x$", keyConcept: "", difficultyNote: "" });
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
});
