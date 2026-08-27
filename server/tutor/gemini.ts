import { GoogleGenAI } from "@google/genai";

export const GEMINI_TUTOR_MODEL = "gemini-3.6-flash";

export type GeminiInlineImage = {
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

type GeminiStructuredRequest = {
  instruction: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  image?: GeminiInlineImage;
  maxOutputTokens: number;
};

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini 解題服務尚未設定。");
  return new GoogleGenAI({ apiKey });
}

/**
 * 只在伺服器執行的 Gemini 結構化輸出封裝。呼叫者不得把 API 金鑰或
 * Supabase 簽名網址傳入瀏覽器；圖片以已授權讀取後的 inline bytes 提供。
 */
export async function generateGeminiJson(request: GeminiStructuredRequest): Promise<string> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_TUTOR_MODEL,
      contents: [{
        role: "user",
        parts: [
          { text: request.prompt },
          ...(request.image ? [{ inlineData: request.image }] : []),
        ],
      }],
      config: {
        systemInstruction: request.instruction,
        responseMimeType: "application/json",
        responseJsonSchema: request.responseJsonSchema,
        temperature: 0.2,
        maxOutputTokens: request.maxOutputTokens,
      },
    });
    if (!response.text) throw new Error("Gemini 未傳回可解析的內容。");
    return response.text;
  } catch (error) {
    console.error("Gemini tutor request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    throw new Error("解題服務暫時無法完成這次處理，請稍後再試。");
  }
}
