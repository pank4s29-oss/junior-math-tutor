import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";

describe("Gemini 伺服器端憑證", () => {
  it("可讀取模型清單且不將金鑰暴露至應用程式回應", async () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key).toBeTruthy();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key ?? "")}`);
    expect(response.ok).toBe(true);
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    expect(payload.models?.some(model => model.name?.includes("gemini"))).toBe(true);
  }, 20_000);

  it("可由選定模型產生符合 JSON schema 的最小回應", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    expect(apiKey).toBeTruthy();
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: "gemini-3.6-flash",
      contents: "請只回覆指定 JSON，ready 欄位的值為 true。",
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: { ready: { type: "boolean" } },
          required: ["ready"],
          additionalProperties: false,
        },
        temperature: 0,
        maxOutputTokens: 512,
      },
    });
    expect(JSON.parse(response.text ?? "{}")).toEqual({ ready: true });
  }, 30_000);
});
