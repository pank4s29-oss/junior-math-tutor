import { GoogleGenAI } from "@google/genai";

export const GEMINI_TUTOR_MODEL = "gemini-3.6-flash";

/**
 * Google 免費層的 RPM／每日配額是「每個模型各自獨立」計算的，不是整個專案共用一個
 * 額度池——這也是為什麼把出題改成批次呼叫（見 practiceGeneration.ts）能省配額，
 * 但省的是同一個模型的配額，多個學生同時解題／出題、加上背景補題排程全部共用
 * gemini-3.6-flash 這唯一一個模型時，還是很容易撞到同一個池子的上限。
 * gemini-3.7-flash 是獨立的模型、有自己的一份免費配額，一旦 3.6 撞到 429／配額
 * 用盡這類「換個模型就能繼續」的錯誤，MODEL_FALLBACK_CHAIN 會讓同一次呼叫立刻
 * 改用 3.7 重試一次，等於把當下可用的免費額度直接翻倍，而不是讓學生乾等或直接
 * 看到「系統忙碌」。若之後 Google 免費層開放更多模型，只要照順序加進這個陣列即可，
 * 不需要更動下面的呼叫邏輯。
 */
export const GEMINI_TUTOR_FALLBACK_MODEL = "gemini-3.7-flash";
const MODEL_FALLBACK_CHAIN = [GEMINI_TUTOR_MODEL, GEMINI_TUTOR_FALLBACK_MODEL] as const;

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
  /**
   * 這次呼叫本身的時間上限（毫秒）。不設定就沒有上限，完全交給 Gemini 自己決定
   * 何時回應——這在單次呼叫罕見卡很久時很危險：呼叫方（例如 Vercel 的 API 路由）
   * 通常自己也有總執行時間上限，一旦被平台強制砍斷連線，回傳的會是平台自己的
   * HTML 錯誤頁而不是我們的 JSON 錯誤格式，前端 tRPC client 會直接解析失敗
   * （出現「Unexpected token '<'/'A'...is not valid JSON」)。設定這個參數後，
   * 我們會自己先用 AbortController 中止請求、乾淨地拋出可辨識的逾時錯誤，
   * 搶在平台強制砍斷之前把主控權拿回來。
   */
  timeoutMs?: number;
};

/** 不將供應商原始錯誤、配額或帳務資訊傳回瀏覽器。 */
export class GeminiTemporaryUnavailableError extends Error {
  readonly retryAfterSeconds?: number;
  /**
   * true 代表偵測到的是「每日配額用盡」，不是單純的每分鐘（RPM）尖峰。這兩種
   * 429 在使用者體感上都是「系統繁忙」，但可修復性完全不同：RPM 尖峰通常幾秒
   * 到幾十秒內就會恢復，值得退避重試；每日配額用盡在同一天內不會自己恢復，
   * 重試只會白白浪費時間預算、讓學生多等好幾秒才看到一樣的失敗結果。
   * 呼叫端（見 practiceGeneration.ts）會依這個旗標決定要不要放棄剩餘重試次數。
   */
  readonly dailyQuotaExhausted: boolean;

  constructor(retryAfterSeconds?: number, dailyQuotaExhausted = false) {
    super(dailyQuotaExhausted
      ? "今日 AI 出題／解題配額已經用完，重試無法解決，請明天再試；教師也可以改用教師工作台「題庫直送」直接上傳或建立題目，不受配額限制。"
      : retryAfterSeconds
        ? `解題服務暫時繁忙，請在約 ${retryAfterSeconds} 秒後再試。題目不需要重新上傳。`
        : "解題服務暫時繁忙，請稍候再試。題目不需要重新上傳。");
    this.name = "GeminiTemporaryUnavailableError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.dailyQuotaExhausted = dailyQuotaExhausted;
  }
}

function getRetryAfterSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const matched = message.match(/retry(?:Delay)?(?:\s+in)?[^0-9]{0,20}(\d+(?:\.\d+)?)s/i);
  return matched ? Math.max(1, Math.min(60, Math.ceil(Number(matched[1])))) : undefined;
}

function isTransientProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b429\b|RESOURCE_EXHAUSTED|\b503\b|UNAVAILABLE|\b408\b|timeout|aborted|AbortError/i.test(message);
}

/**
 * 只挑出「換個模型就有機會繼續」的錯誤：對方明確拒絕（429 配額/頻率限制、503
 * 服務過載），這類錯誤幾乎都是立即回應、不會卡住等待，換下一個模型重試的額外
 * 延遲很小。刻意不包含逾時／主動中止（408、timeout、aborted）：那類錯誤代表
 * 這次呼叫本身已經吃掉大部分時間預算，換模型再等一次容易讓總延遲翻倍、逼近或
 * 超過呼叫端（見 practiceGeneration.ts）自己算好的時間預算，也可能撞上 Vercel
 * 的函式執行時間上限，所以那類錯誤維持原本行為，直接往外拋給呼叫端的重試邏輯。
 */
function isRateLimitOrOutageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b429\b|RESOURCE_EXHAUSTED|\b503\b|UNAVAILABLE/i.test(message);
}

/**
 * 判斷 429 是不是「每日配額用盡」，不是單純的每分鐘尖峰。
 * Google 免費層配額用盡時，錯誤內容通常會帶有形如
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier` 的 quotaId，或直接提到
 * "PerDay" ／ "daily"；這類錯誤幾乎不會同時帶有合理的 retryDelay（因為距離
 * 配額重置往往是幾小時起跳，供應商不會建議「等 N 秒後重試」），單看訊息內容
 * 就能相當可靠地跟「等幾秒就恢復」的 RPM 尖峰區分開來。
 */
function isDailyQuotaExhaustedProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /perday|per[\s-]?day|daily quota|requests per day/i.test(message);
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

/** 對單一模型送出一次請求；逾時／中止的處理保持不變，每個模型各自有獨立的 AbortController。 */
async function requestFromModel(model: string, request: GeminiStructuredRequest): Promise<string> {
  const controller = request.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(new Error(`Gemini 請求超過自訂逾時 ${request.timeoutMs}ms，主動中止。`)), request.timeoutMs) : undefined;
  try {
    const response = await getGeminiClient(request.purpose ?? "solve").models.generateContent({
      model,
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
        ...(controller ? { abortSignal: controller.signal } : {}),
      },
    });
    if (!response.text) throw new Error("Gemini 未傳回可解析的內容。");
    return repairBrokenJsonEscapes(response.text);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 只在伺服器執行的 Gemini 結構化輸出封裝。呼叫者不得把 API 金鑰或
 * Supabase 簽名網址傳入瀏覽器；圖片或 PDF 以已授權讀取後的 inline bytes 提供。
 */
export async function generateGeminiJson(request: GeminiStructuredRequest): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i += 1) {
    const model = MODEL_FALLBACK_CHAIN[i];
    const isLastModel = i === MODEL_FALLBACK_CHAIN.length - 1;
    try {
      return await requestFromModel(model, request);
    } catch (error) {
      lastError = error;
      console.error("Gemini tutor request failed", {
        model, message: error instanceof Error ? error.message : "unknown error",
      });
      // 只有「換模型就有機會繼續」的錯誤才會嘗試下一個模型（見 isRateLimitOrOutageError
      // 上方註解）；其餘錯誤（逾時、中止、金鑰未設定等）直接跳出迴圈，用這次的錯誤
      // 走下面既有的分類與轉換邏輯，不浪費時間再打一次注定失敗或代價太高的請求。
      if (isLastModel || !isRateLimitOrOutageError(error)) break;
      console.error(`Gemini model ${model} rate-limited/unavailable, falling back to ${MODEL_FALLBACK_CHAIN[i + 1]}`);
    }
  }
  if (isTransientProviderError(lastError)) {
    throw new GeminiTemporaryUnavailableError(getRetryAfterSeconds(lastError), isDailyQuotaExhaustedProviderError(lastError));
  }
  throw new Error("解題服務暫時無法完成這次處理，請稍後再試。");
}
