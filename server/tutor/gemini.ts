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
  /** 預設 "low"。thinking 等級越高，延遲越高、也越容易把推理過程留在輸出欄位裡。 */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
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

/**
 * Gemini 在 JSON 模式下，若欄位內容包含 LaTeX 巨集（例如 \times、\text{}、\frac{}{}、
 * \right），有時不會把巨集的反斜線正確跳脫成 JSON 合法的 \\times，而是直接寫出單一反
 * 斜線。這剛好撞上 \t、\f、\b、\r、\n 這幾個「合法」的 JSON 逃脫序列：JSON.parse 不會
 * 報錯，而是把反斜線加上緊接的那個字母吃成看不見的控制字元（tab／form feed／
 * backspace／換行…），只留下巨集名稱剩下的字母。學生畫面上因此會看到「8imes25」
 * 「rac{}{}」「ext{}」這類殘缺巨集名稱——分別對應被吃掉開頭字母的 \times、\frac、\text。
 *
 * 這裡在 JSON.parse 之前，把「反斜線 + t/f/b/r/n，後面還接著英文字母」這種明顯是被
 * JSON 逃脫規則誤判的樣式，改寫成雙反斜線，讓 JSON.parse 正確還原成「一個反斜線 +
 * 完整巨集名稱」的字面文字，而不是被吃成控制字元。
 *
 * \t、\f、\b 在這個應用的內容裡完全沒有正當用途（教學文字不會刻意塞入 tab／
 * form feed／backspace 控制字元），所以只要後面接著字母就一律視為誤判、直接修正。
 * \r、\n 比較敏感，因為欄位本身可能真的用 \n 表示換行；只在後面接的字母組成已知的
 * LaTeX 巨集殘字（例如 ewcommand、ight、eq、otin、abla）時才修正，避免誤傷真正想
 * 要換行、後面剛好接英文字母／數字的內容。
 */
const LATEX_MACRO_TAIL_AFTER_R_OR_N = /^(ewcommand|ight|eq|otin|abla|e\b)/;

export function repairBrokenJsonEscapes(raw: string): string {
  return raw.replace(/\\([tfbrn])(?=[A-Za-z])/g, (match, letter: string, offset: number) => {
    if (letter === "t" || letter === "f" || letter === "b") return `\\\\${letter}`;
    const tail = raw.slice(offset + 2, offset + 14);
    return LATEX_MACRO_TAIL_AFTER_R_OR_N.test(tail) ? `\\\\${letter}` : match;
  });
}

// SDK 的 ThinkingLevel enum 底層就是這幾個大寫字串常數；這裡直接寫字面值，
// 避免在測試環境對 @google/genai 的部分 mock 裡還要額外補這個匯出。
const THINKING_LEVEL_MAP = {
  minimal: "MINIMAL", low: "LOW", medium: "MEDIUM", high: "HIGH",
} as const;

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
        // gemini-3.6-flash 預設會開啟較高等級的思考（thinking），官方實測光是「第一個
        // token 出現前」的等待時間中位數就高達 12 秒以上，且思考過程有時會被誤留在
        // JSON 字串欄位裡（例如「Wait, let's fix LaTeX...」這類自言自語）。這裡把
        // 思考等級明確降到 low：對這個應用需要的「出一道國中數學題」「照 schema 說明
        // 解法」這類任務來說，思考量已經足夠，同時大幅降低逾時與內容洩漏的機率。
        thinkingConfig: { thinkingLevel: THINKING_LEVEL_MAP[request.thinkingLevel ?? "low"] as any },
      },
    });
    if (!response.text) throw new Error("Gemini 未傳回可解析的內容。");
    return repairBrokenJsonEscapes(response.text);
  } catch (error) {
    console.error("Gemini tutor request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    if (isTransientProviderError(error)) throw new GeminiTemporaryUnavailableError(getRetryAfterSeconds(error));
    throw new Error("解題服務暫時無法完成這次處理，請稍後再試。");
  }
}
