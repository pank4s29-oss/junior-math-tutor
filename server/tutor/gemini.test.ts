import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  GoogleGenAI: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: mocks.GoogleGenAI,
}));

import { GEMINI_TUTOR_FALLBACK_MODEL, GEMINI_TUTOR_MODEL, generateGeminiJson, repairBrokenJsonEscapes } from "./gemini";

describe("Gemini 結構化數學解題相容層", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.GoogleGenAI.mockImplementation(() => ({
      models: { generateContent: mocks.generateContent },
    }));
    mocks.generateContent.mockResolvedValue({ text: '{"status":"ready"}' });
  });

  it("以固定 JSON schema 與伺服器端圖片資料呼叫 Gemini", async () => {
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x + 2 = 5。",
      responseJsonSchema: { type: "object" },
      image: { data: "aGVsbG8=", mimeType: "image/png" },
      maxOutputTokens: 800,
    })).resolves.toBe('{"status":"ready"}');

    expect(mocks.GoogleGenAI).toHaveBeenCalledWith({ apiKey: expect.any(String) });
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: GEMINI_TUTOR_MODEL,
      config: expect.objectContaining({
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object" },
        maxOutputTokens: 800,
      }),
      contents: [expect.objectContaining({
        parts: expect.arrayContaining([expect.objectContaining({ inlineData: { data: "aGVsbG8=", mimeType: "image/png" } })]),
      })],
    }));
  });

  it("不回傳上游錯誤細節給學生端", async () => {
    mocks.generateContent.mockRejectedValue(new Error("upstream sensitive diagnostic"));
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x = 1。",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 400,
    })).rejects.toThrow("解題服務暫時無法完成這次處理");
  });

  it("將供應商 429 安全轉為可操作的繁忙提示與等待秒數", async () => {
    mocks.generateContent.mockRejectedValue(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"9.2s"}]}}'));
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x = 1。",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 400,
    })).rejects.toThrow("約 10 秒後再試");
  });

  it("主要模型撞到 429／配額用盡時，同一次呼叫會立即改用備援模型（gemini-3.7-flash）重試，不需要呼叫端自己再試一次", async () => {
    mocks.generateContent
      .mockRejectedValueOnce(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))
      .mockResolvedValueOnce({ text: '{"status":"ready"}' });
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x = 1。",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 400,
    })).resolves.toBe('{"status":"ready"}');
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(mocks.generateContent.mock.calls[0][0]).toEqual(expect.objectContaining({ model: GEMINI_TUTOR_MODEL }));
    expect(mocks.generateContent.mock.calls[1][0]).toEqual(expect.objectContaining({ model: GEMINI_TUTOR_FALLBACK_MODEL }));
  });

  it("兩個模型都撞到 429／配額用盡時，才真正回報繁忙（備援不是無限重試）", async () => {
    mocks.generateContent.mockRejectedValue(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"9.2s"}]}}'));
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x = 1。",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 400,
    })).rejects.toThrow("約 10 秒後再試");
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it("逾時／中止類錯誤不會觸發備援模型，避免總延遲翻倍超過呼叫端的時間預算", async () => {
    mocks.generateContent.mockRejectedValue(new Error("The operation was aborted"));
    await expect(generateGeminiJson({
      instruction: "只輸出 JSON。",
      prompt: "解 x = 1。",
      responseJsonSchema: { type: "object" },
      maxOutputTokens: 400,
      timeoutMs: 5000,
    })).rejects.toThrow("解題服務暫時繁忙");
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it("修正 Gemini 把 LaTeX 巨集反斜線寫成單一反斜線、被 JSON 逃脫規則吃成控制字元的殘缺巨集（\\times、\\frac、\\text、\\right）", async () => {
    // 模擬 Gemini 實際送回的、反斜線沒有正確雙寫的原始 JSON 文字：
    // \times、\frac、\text 的反斜線 + 開頭字母會被 JSON.parse 當成 \t/\f 等逃脫序列吃掉，
    // 留下 imes、rac、ext 這類殘缺巨集名稱直接印給學生看。
    const brokenWireJson = '{"question":"$8\\times10^7$ 與 $\\frac{1}{2}$ 且 $\\text{}$，$2\\right)$"}';
    mocks.generateContent.mockResolvedValue({ text: brokenWireJson });

    const content = await generateGeminiJson({
      instruction: "只輸出 JSON。", prompt: "出一題。", responseJsonSchema: { type: "object" }, maxOutputTokens: 400,
    });
    const parsed = JSON.parse(content) as { question: string };

    expect(parsed.question).toContain("\\times");
    expect(parsed.question).toContain("\\frac{1}{2}");
    expect(parsed.question).toContain("\\text{}");
    expect(parsed.question).toContain("\\right)");
    // 巨集名稱前面一定要接著反斜線；沒有反斜線的殘缺巨集名稱（times 被吃成 imes、
    // frac 被吃成 rac、text 被吃成 ext）代表修正失敗，不能出現在最終文字裡。
    expect(parsed.question).not.toMatch(/[^\\t]imes/);
    expect(parsed.question).not.toMatch(/[^\\f]rac\{/);
    expect(parsed.question).not.toMatch(/[^\\t]ext\{/);
  });

  it("正確保留原本就是換行用途的 \\n，不誤判成 LaTeX 巨集殘字", async () => {
    mocks.generateContent.mockResolvedValue({ text: '{"work":"第一行\\n第二行"}' });
    const content = await generateGeminiJson({
      instruction: "只輸出 JSON。", prompt: "解一題。", responseJsonSchema: { type: "object" }, maxOutputTokens: 400,
    });
    const parsed = JSON.parse(content) as { work: string };
    expect(parsed.work).toBe("第一行\n第二行");
  });
});

describe("repairBrokenJsonEscapes", () => {
  it("把後面接英文字母的 \\t / \\f / \\b 一律視為誤判的 LaTeX 巨集殘字並修正", () => {
    expect(JSON.parse(repairBrokenJsonEscapes('"\\times"'))).toBe("\\times");
    expect(JSON.parse(repairBrokenJsonEscapes('"\\frac{1}{2}"'))).toBe("\\frac{1}{2}");
    expect(JSON.parse(repairBrokenJsonEscapes('"\\text{ok}"'))).toBe("\\text{ok}");
  });

  it("只在 \\r / \\n 後面接已知 LaTeX 巨集殘字時才修正，避免誤傷真正的換行", () => {
    expect(JSON.parse(repairBrokenJsonEscapes('"\\right)"'))).toBe("\\right)");
    expect(JSON.parse(repairBrokenJsonEscapes('"a\\nb"'))).toBe("a\nb");
  });
});
