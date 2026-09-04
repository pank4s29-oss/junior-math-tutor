import type { Grade, PracticeDifficulty } from "../../shared/mathCurriculum";
import { PRACTICE_DIFFICULTY_DESCRIPTIONS, PRACTICE_DIFFICULTY_LABELS } from "../../shared/mathCurriculum";
import {
  buildPracticeGenerationInstructions, hasLeakedDraftArtifacts, parsePracticeGeneration,
  practiceGenerationResponseFormat, type PracticeGeneration,
} from "./engine";
import { GeminiTemporaryUnavailableError, generateGeminiJson } from "./gemini";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type PracticeGenerationTarget = {
  grade: Grade;
  unitKey: string;
  unitLabel: string;
  difficulty: PracticeDifficulty;
  teacherRules: string;
  approvedContext: Array<{ title: string; body: string; type: string }>;
  /** 同單元＋同難度最近已出過的題目文字，用來提醒模型避開重複題型，提升多樣性。 */
  recentQuestions?: string[];
};

export type PracticeGenerationOutcome =
  | { ok: true; generation: PracticeGeneration }
  | { ok: false };

/**
 * 呼叫 Gemini 產生一道全新練習題，內建重試與時間預算保護。
 *
 * 這段邏輯原本內嵌在 generatePractice tRPC procedure 裡；現在抽成獨立函式，
 * 讓兩個呼叫端共用同一套重試／清潔度檢查規則，不再各自維護、逐漸分歧：
 * 1. 「即時出題」：題庫用盡（或題庫暫時不可用）時的即時備援路徑。
 * 2. 「背景題庫補題」：cron 排程呼叫，預先把題目存進題庫（見 practiceQuestionBank.ts）。
 *
 * 呼叫方若需要在額度已扣除的情況下退款，請自行在呼叫端 try/catch：這裡拋出的
 * 例外（例如 Gemini 暫時無法使用）會原樣往外傳，不在這裡吞掉或轉換。
 */
export async function generatePracticeQuestionWithRetry(
  target: PracticeGenerationTarget,
  options?: { timeBudgetMs?: number },
): Promise<PracticeGenerationOutcome> {
  const instruction = buildPracticeGenerationInstructions({
    grade: target.grade,
    unitLabel: target.unitLabel,
    difficultyLabel: PRACTICE_DIFFICULTY_LABELS[target.difficulty],
    difficultyGuidance: PRACTICE_DIFFICULTY_DESCRIPTIONS[target.difficulty],
    teacherRules: target.teacherRules,
    approvedContext: target.approvedContext,
    recentQuestions: target.recentQuestions,
  });
  const prompt = `請為「${target.unitLabel}」出一題全新的「${PRACTICE_DIFFICULTY_LABELS[target.difficulty]}」難度練習題。`;

  const startedAt = Date.now();
  // 60 秒的 Vercel maxDuration 上限扣掉資料庫存取與其他處理時間的安全緩衝；
  // 背景補題排程（practiceQuestionBank.ts）會依自己剩餘的時間預算傳入較小的值。
  const TIME_BUDGET_MS = options?.timeBudgetMs ?? 40_000;
  const MIN_ATTEMPT_BUDGET_MS = 9_000; // 剩餘時間低於這個門檻就不值得再試一次，直接乾淨收手。
  const MAX_ATTEMPTS = 3;

  // 最多嘗試三次：模型偶爾會把思考草稿、沒收尾的 LaTeX，或運算符號被吃掉的殘缺敘述
  // （例如「Wait, let's fix LaTeX in question.」、「1AB 的結果」）直接寫進欄位內容，
  // 與其把這種內容送給學生看，不如自動重打；但重試次數與時間都要有上限。
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = TIME_BUDGET_MS - (Date.now() - startedAt);
    if (remainingMs < MIN_ATTEMPT_BUDGET_MS) {
      console.error("Practice generation aborted retry: time budget exceeded", {
        grade: target.grade, unitKey: target.unitKey, difficulty: target.difficulty, elapsedMs: Date.now() - startedAt,
      });
      break;
    }

    let content: string;
    try {
      content = await generateGeminiJson({
        instruction, prompt,
        // 思考型模型會先消耗部分輸出 token 在內部推理／草稿，額度太低容易讓最終
        // JSON 被截斷、或逼得模型把草稿直接留在字串欄位裡，但額度也不能無限拉高，
        // 否則單次呼叫本身就可能拖過剩餘的時間預算。
        responseJsonSchema: practiceGenerationResponseFormat.json_schema.schema, maxOutputTokens: 4096,
        // 只有第一次嘗試、且剩餘時間還算充裕時才用 "medium" 換取更穩定的輸出品質；
        // 之後的重試一律降回 "low"，確保能在剩餘的時間預算內完成。
        thinkingLevel: attempt === 1 && remainingMs >= 25_000 ? "medium" : "low",
        // 留 2 秒緩衝給 JSON 解析與後續處理，避免逾時控制本身踩線。
        timeoutMs: Math.max(MIN_ATTEMPT_BUDGET_MS, remainingMs - 2_000),
      });
    } catch (error) {
      // 這是這一輪修正的關鍵：Gemini 免費層級的 RPM（每分鐘請求數）通常只有 10～15，
      // 而且是整個專案共用，不是分金鑰各自計算。背景補題、多個學生同時出題／解題
      // 全部搶同一份額度，撞到 429（RESOURCE_EXHAUSTED）是常態、不是例外狀況。
      // 先前這裡完全沒有 try/catch，429 會直接往外拋、跳過整個重試迴圈——只要第一次
      // 呼叫遇到瞬間的額度尖峰，學生連第一題都還沒生成就會看到「系統繁忙」。
      // 現在遇到可辨識的暫時性錯誤時，尊重伺服器建議的等待秒數（retryAfterSeconds）
      // 退避後繼續下一輪迴圈，而不是把最後一次嘗試的機會浪費在完全不重試上。
      const isTransient = error instanceof GeminiTemporaryUnavailableError;
      console.error(`Practice generation attempt ${attempt} failed`, {
        grade: target.grade, unitKey: target.unitKey, difficulty: target.difficulty,
        transient: isTransient, message: error instanceof Error ? error.message : "unknown error",
      });
      if (!isTransient) throw error; // 不是可重試的暫時性錯誤（例如金鑰未設定），沒有重試的意義，直接往外拋。
      if (attempt === MAX_ATTEMPTS) throw error; // 已經是最後一次嘗試，重試也沒有意義了，把原始錯誤往外拋讓呼叫端處理退款。

      const remainingAfterFailure = TIME_BUDGET_MS - (Date.now() - startedAt);
      const backoffMs = Math.min((error.retryAfterSeconds ?? 2) * 1000, Math.max(0, remainingAfterFailure - MIN_ATTEMPT_BUDGET_MS));
      if (backoffMs > 0) await sleep(backoffMs);
      continue;
    }

    const parsed = parsePracticeGeneration(content);
    const isClean = Boolean(parsed.question)
      && !hasLeakedDraftArtifacts(parsed.question)
      && !hasLeakedDraftArtifacts(parsed.keyConcept)
      && !hasLeakedDraftArtifacts(parsed.difficultyNote);
    if (isClean) return { ok: true, generation: parsed };
    console.error(`Practice generation attempt ${attempt} produced unusable content`, {
      grade: target.grade, unitKey: target.unitKey, difficulty: target.difficulty, contentPreview: content.slice(0, 500),
    });
  }
  return { ok: false };
}
