import { GoogleGenAI } from "@google/genai";

export const GEMINI_TUTOR_MODEL = "gemini-3.6-flash";

export type GeminiInlineImage = {
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
};

type GeminiStructuredRequest = {
  instruction: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  image?: GeminiInlineImage;
  maxOutputTokens: number;
  /** 預設 "solve"；教材擷取流程應明確傳入 "material" 以分流至獨立金鑰。 */
  purpose?: "solve" | "material";
};

/** 不將供應商原始錯誤、配額或帳務資訊傳回瀏覽器。 */
export class GeminiTemporaryUnavailableError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super(retryAfterSeconds
      ? `解題服務暫時繁忙，請在約 ${retryAfterSeconds} 秒後再試。題目不需要重新上傳。`
      : "解題服務暫時繁忙，請稍候再試。題目不需要重新上傳。");
    this.name = "GeminiTemporaryUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getRetryAfterSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const matched = message.match(/retry(?:Delay)?(?:\s+in)?[^0-9]{0,20}(\d+(?:\.\d+)?)s/i);
  return matched ? Math.max(1, Math.min(60, Math.ceil(Number(matched[1])))) : undefined;
}

function isTransientProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b429\b|RESOURCE_EXHAUSTED|\b503\b|UNAVAILABLE|\b408\b|timeout/i.test(message);
}

const clientCache = new Map<string, GoogleGenAI>();

/**
 * `purpose` 決定使用哪一把 API 金鑰：
 * - "solve"：學生即時解題／手寫辨識，永遠用 GEMINI_API_KEY。
 * - "material"：教師教材 PDF 擷取，屬低頻、非即時的背景工作。若設定了
 *   GEMINI_MATERIAL_API_KEY（建議另開一個 Google Cloud 專案／金鑰），
 *   就改用它，避免教材上傳吃掉學生即時解題共用的每日配額；
 *   未設定時退回 GEMINI_API_KEY，行為與先前相同，不強制要求額外設定。
 */
function getGeminiClient(purpose: "solve" | "material" = "solve") {
  const apiKey = (purpose === "material" ? process.env.GEMINI_MATERIAL_API_KEY?.trim() : undefined)
    || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini 解題服務尚未設定。");
  const cached = clientCache.get(apiKey);
  if (cached) return cached;
  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);
  return client;
}

/**
 * 只在伺服器執行的 Gemini 結構化輸出封裝。呼叫者不得把 API 金鑰或
 * Supabase 簽名網址傳入瀏覽器；圖片或 PDF 以已授權讀取後的 inline bytes 提供。
 */
export async function generateGeminiJson(request: GeminiStructuredRequest): Promise<string> {
  try {
    const response = await getGeminiClient(request.purpose ?? "solve").models.generateContent({
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
    if (isTransientProviderError(error)) throw new GeminiTemporaryUnavailableError(getRetryAfterSeconds(error));
    throw new Error("解題服務暫時無法完成這次處理，請稍後再試。");
  }
}
