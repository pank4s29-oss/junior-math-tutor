import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  GoogleGenAI: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: mocks.GoogleGenAI,
}));

import { GEMINI_TUTOR_MODEL, generateGeminiJson } from "./gemini";

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
});
