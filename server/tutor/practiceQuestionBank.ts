import { CORE_UNITS, GRADES, PRACTICE_DIFFICULTIES, type Grade, type PracticeDifficulty } from "../../shared/mathCurriculum";
import { GEMINI_TUTOR_MODEL } from "./gemini";
import { generatePracticeQuestionWithRetry } from "./practiceGeneration";
import * as tutorDb from "./supabaseDb";
import * as supabaseTeacherDb from "./supabaseTeacherDb";

/**
 * 題庫每個「年級＋單元＋難度」組合希望隨時維持的可用題目下限。
 * 低於這個數字，補題排程就會為這個組合再生成新題，直到補滿或時間預算用盡。
 * 30 分/天的出題額度、加上題目一次性領取即從池中移除，6 題大約能撐過一次
 * cron 週期之間的正常用量尖峰，同時不會讓單一組合佔用過多題庫儲存空間。
 */
export const BANK_TARGET_POOL_SIZE = 6;

/**
 * 單次排程執行最多為單一組合補幾題，避免單一組合把整次執行的時間預算全部用完，
 * 讓多個組合都有機會在同一次執行裡分到補題額度；題庫會在後續多次執行中逐步補滿。
 */
const MAX_NEW_QUESTIONS_PER_COMBINATION_PER_RUN = 3;

export type BankCombination = { grade: Grade; unitKey: string; unitLabel: string; difficulty: PracticeDifficulty };

/**
 * 題庫涵蓋範圍：所有核心單元，加上教師已核准的自訂單元；每個單元的三種難度
 * 都各自獨立維護一個題庫（因為出題時是以「年級＋單元＋難度」三個條件挑題）。
 */
export async function listBankCombinations(): Promise<BankCombination[]> {
  const approvedCustomUnits = await supabaseTeacherDb.listApprovedStudentUnits();
  const combinations: BankCombination[] = [];
  for (const grade of GRADES) {
    const coreUnitKeys = new Set(CORE_UNITS[grade].map(unit => unit.key));
    const units = [
      ...CORE_UNITS[grade].map(unit => ({ unitKey: unit.key, unitLabel: unit.label })),
      ...approvedCustomUnits
        .filter(unit => unit.grade === grade && !coreUnitKeys.has(unit.key))
        .map(unit => ({ unitKey: unit.key, unitLabel: unit.label })),
    ];
    for (const unit of units) {
      for (const difficulty of PRACTICE_DIFFICULTIES) {
        combinations.push({ grade, unitKey: unit.unitKey, unitLabel: unit.unitLabel, difficulty });
      }
    }
  }
  return combinations;
}

export type RefillSummary = {
  combinationsChecked: number;
  combinationsBelowTarget: number;
  questionsGenerated: number;
  questionsFailed: number;
  timedOut: boolean;
  elapsedMs: number;
};

function poolCountKey(item: { grade: Grade; unitKey: string; difficulty: PracticeDifficulty }) {
  return `${item.grade}::${item.unitKey}::${item.difficulty}`;
}

/**
 * 背景補題主流程：依「目前庫存最少的組合優先」排序，逐一為庫存不足的組合呼叫
 * Gemini 補題，直到所有組合補滿 BANK_TARGET_POOL_SIZE，或時間預算用盡為止。
 *
 * 設計成可以被頻繁、重複呼叫（例如每 10～15 分鐘一次 cron，或手動觸發）：
 * 每次執行做多少算多少，題庫不會因為單次執行沒補滿就卡住——下一次執行會
 * 接著補，狀態完全存在資料庫裡，這支函式本身是無狀態、可重入的。單一組合
 * 補題失敗（例如 Gemini 暫時繁忙）只會記錄下來，不會中止其他組合的補題。
 */
export async function refillPracticeQuestionBank(options?: { timeBudgetMs?: number }): Promise<RefillSummary> {
  const startedAt = Date.now();
  const TIME_BUDGET_MS = options?.timeBudgetMs ?? 50_000; // 60 秒 maxDuration 扣掉安全緩衝。
  const MIN_REMAINING_BUDGET_MS = 12_000; // 低於這個門檻就不值得再開始新的一次 Gemini 呼叫。

  const [combinations, poolCounts] = await Promise.all([
    listBankCombinations(),
    tutorDb.getPracticeQuestionBankPoolCounts(),
  ]);
  const countByKey = new Map(poolCounts.map(row => [poolCountKey(row), row.availableCount]));

  const deficits = combinations
    .map(combo => ({ combo, available: countByKey.get(poolCountKey(combo)) ?? 0 }))
    .filter(item => item.available < BANK_TARGET_POOL_SIZE)
    .sort((a, b) => a.available - b.available);

  const summary: RefillSummary = {
    combinationsChecked: combinations.length,
    combinationsBelowTarget: deficits.length,
    questionsGenerated: 0,
    questionsFailed: 0,
    timedOut: false,
    elapsedMs: 0,
  };

  for (const { combo, available } of deficits) {
    const needed = Math.min(BANK_TARGET_POOL_SIZE - available, MAX_NEW_QUESTIONS_PER_COMBINATION_PER_RUN);
    for (let i = 0; i < needed; i += 1) {
      const remainingMs = TIME_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs < MIN_REMAINING_BUDGET_MS) {
        summary.timedOut = true;
        summary.elapsedMs = Date.now() - startedAt;
        return summary;
      }

      try {
        // 每次都重新讀取教師規則／核准內容：教師若在補題排程執行期間更新了單元規則，
        // 題庫裡新產生的題目應該反映最新版本，而不是沿用執行一開始快取的舊規則。
        const context = await supabaseTeacherDb.getTutorContext(combo.grade, combo.unitKey);
        const unitLabel = context.name ?? combo.unitLabel;
        const outcome = await generatePracticeQuestionWithRetry(
          {
            grade: combo.grade, unitKey: combo.unitKey, unitLabel, difficulty: combo.difficulty,
            teacherRules: context.rules, approvedContext: context.contents,
          },
          { timeBudgetMs: Math.max(MIN_REMAINING_BUDGET_MS, Math.min(remainingMs - 2_000, 30_000)) },
        );

        if (!outcome.ok) {
          summary.questionsFailed += 1;
          continue;
        }

        await tutorDb.insertPracticeQuestionBankItem({
          grade: combo.grade, unitKey: combo.unitKey, unitLabel, difficulty: combo.difficulty,
          questionText: outcome.generation.question, keyConcept: outcome.generation.keyConcept,
          difficultyNote: outcome.generation.difficultyNote, model: GEMINI_TUTOR_MODEL,
        });
        summary.questionsGenerated += 1;
      } catch (error) {
        summary.questionsFailed += 1;
        console.error("Practice question bank refill failed for combination", {
          grade: combo.grade, unitKey: combo.unitKey, difficulty: combo.difficulty,
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  }

  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}
