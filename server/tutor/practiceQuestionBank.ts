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
 * 同時間最多幾個補題呼叫平行進行。
 *
 * Gemini API 免費層級的 RPM（每分鐘請求數）通常只有 10～15，而且是「整個
 * 專案共用」，不是分金鑰各自計算——學生即時解題、即時出題、背景補題全部
 * 搶同一份額度。並行度調高看似能在同一次執行補更多題，但也更容易瞬間衝出
 * RPM 上限，反而讓當下正在使用中的學生撞到 429。這裡改回序列處理（一次一
 * 個），把「同一次執行盡量多補幾題」的目標讓給更保守的
 * MAX_GEMINI_CALLS_PER_RUN，並靠 GitHub Actions 頻繁但每次量少的排程來補足
 * 總補題速度，而不是靠單次執行的爆發並行。
 */
const REFILL_CONCURRENCY = 1;

/**
 * 單次執行最多呼叫幾次 Gemini，不論還有多少組合缺貨。這是背景補題「不跟學生
 * 搶額度」最主要的防線：假設 RPM 上限抓保守一點（10～15），單次執行最多
 * 4 次呼叫，搭配 GitHub Actions 每 10 分鐘觸發一次，背景補題整體最多也只占用
 * 約 24 requests/小時，其餘額度留給即時解題／出題。題庫補不滿的組合，下一次
 * 執行會接著補，不會因為這個上限而卡住——只是分散在更多次執行完成，而不是
 * 一次全部補齊。
 */
const MAX_GEMINI_CALLS_PER_RUN = 4;

/**
 * 背景補題主流程：依「目前庫存最少的組合優先」排序，把所有還沒補滿的組合展開成
 * 一份「這一題要補給哪個組合」的工作清單，用最多 REFILL_CONCURRENCY 個併發
 * worker 平行消化，直到清單處理完或時間預算用盡為止（比完全序列快上數倍，
 * 同一個 60 秒執行視窗內能多補好幾題，題庫更容易維持在目標庫存量）。
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

  // 展開成扁平的工作清單：同一個組合若還缺 3 題，就會在清單裡出現 3 次獨立的工作。
  // 用來源清單依「庫存最少優先」的順序保留，讓並行 worker 仍然大致依這個優先順序消化。
  // 再套用 MAX_GEMINI_CALLS_PER_RUN 總量上限：即使缺口很大，單次執行也只處理前面
  // 這幾個最急迫的組合，其餘留給下一次執行，避免一次把整份共用額度用光。
  const tasks = deficits
    .flatMap(({ combo, available }) =>
      Array.from({ length: Math.min(BANK_TARGET_POOL_SIZE - available, MAX_NEW_QUESTIONS_PER_COMBINATION_PER_RUN) }, () => combo))
    .slice(0, MAX_GEMINI_CALLS_PER_RUN);

  let nextTaskIndex = 0;
  let timedOut = false;

  async function worker() {
    for (;;) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      if (taskIndex >= tasks.length) return;

      const remainingMs = TIME_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs < MIN_REMAINING_BUDGET_MS) { timedOut = true; return; }

      const combo = tasks[taskIndex];
      try {
        // 每次都重新讀取教師規則／核准內容：教師若在補題排程執行期間更新了單元規則，
        // 題庫裡新產生的題目應該反映最新版本，而不是沿用執行一開始快取的舊規則。
        const [context, recentQuestions] = await Promise.all([
          supabaseTeacherDb.getTutorContext(combo.grade, combo.unitKey),
          tutorDb.listRecentBankQuestionTexts({ grade: combo.grade, unitKey: combo.unitKey, difficulty: combo.difficulty }),
        ]);
        const unitLabel = context.name ?? combo.unitLabel;
        const outcome = await generatePracticeQuestionWithRetry(
          {
            grade: combo.grade, unitKey: combo.unitKey, unitLabel, difficulty: combo.difficulty,
            teacherRules: context.rules, approvedContext: context.contents, recentQuestions,
          },
          { timeBudgetMs: Math.max(MIN_REMAINING_BUDGET_MS, Math.min(remainingMs - 2_000, 30_000)) },
        );

        if (!outcome.ok) { summary.questionsFailed += 1; continue; }

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

  await Promise.all(Array.from({ length: Math.min(REFILL_CONCURRENCY, tasks.length) }, () => worker()));

  summary.timedOut = timedOut;
  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}
