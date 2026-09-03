import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_UNITS, GRADES, PRACTICE_DIFFICULTIES, type Grade, type PracticeDifficulty } from "../../shared/mathCurriculum";

const mocks = vi.hoisted(() => ({
  listApprovedStudentUnits: vi.fn(),
  getTutorContext: vi.fn(),
  getPracticeQuestionBankPoolCounts: vi.fn(),
  insertPracticeQuestionBankItem: vi.fn(),
  generatePracticeQuestionWithRetry: vi.fn(),
}));

vi.mock("./supabaseTeacherDb", () => ({
  listApprovedStudentUnits: mocks.listApprovedStudentUnits, getTutorContext: mocks.getTutorContext,
}));
vi.mock("./supabaseDb", () => ({
  getPracticeQuestionBankPoolCounts: mocks.getPracticeQuestionBankPoolCounts,
  insertPracticeQuestionBankItem: mocks.insertPracticeQuestionBankItem,
}));
vi.mock("./practiceGeneration", () => ({ generatePracticeQuestionWithRetry: mocks.generatePracticeQuestionWithRetry }));
vi.mock("./gemini", () => ({ GEMINI_TUTOR_MODEL: "gemini-3.6-flash" }));

import { BANK_TARGET_POOL_SIZE, listBankCombinations, refillPracticeQuestionBank } from "./practiceQuestionBank";

/** 產生「每個組合都已補滿」的庫存快照，方便測試只針對少數幾個組合覆寫成低於門檻。 */
function fullPoolCounts(overrides: Record<string, number> = {}) {
  const rows: Array<{ grade: Grade; unitKey: string; difficulty: PracticeDifficulty; availableCount: number }> = [];
  for (const grade of GRADES) {
    for (const unit of CORE_UNITS[grade]) {
      for (const difficulty of PRACTICE_DIFFICULTIES) {
        const key = `${grade}::${unit.key}::${difficulty}`;
        rows.push({ grade, unitKey: unit.key, difficulty, availableCount: key in overrides ? overrides[key] : BANK_TARGET_POOL_SIZE });
      }
    }
  }
  return rows;
}

const CLEAN_GENERATION = { question: "解 $x$。", keyConcept: "移項", difficultyNote: "單一步驟。" };

describe("listBankCombinations", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("涵蓋所有核心單元 × 三種難度，且沒有教師核准的自訂單元時不多不少", async () => {
    mocks.listApprovedStudentUnits.mockResolvedValue([]);
    const combinations = await listBankCombinations();
    const expectedCount = GRADES.reduce((sum, grade) => sum + CORE_UNITS[grade].length * PRACTICE_DIFFICULTIES.length, 0);
    expect(combinations).toHaveLength(expectedCount);
    expect(combinations.filter(item => item.grade === "seven" && item.unitKey === "linear-equations")).toHaveLength(3);
  });

  it("加入教師已核准的自訂單元，且不會與核心單元重複", async () => {
    mocks.listApprovedStudentUnits.mockResolvedValue([
      { grade: "seven", key: "probability-tree", label: "樹狀圖與條件機率" },
      { grade: "seven", key: "linear-equations", label: "一元一次方程式（教師覆寫名稱）" }, // 與核心單元代碼重複，不應該多算一次
    ]);
    const combinations = await listBankCombinations();
    const customUnitCombos = combinations.filter(item => item.unitKey === "probability-tree");
    expect(customUnitCombos).toHaveLength(3);
    expect(customUnitCombos[0]?.unitLabel).toBe("樹狀圖與條件機率");
    const duplicateCoreCombos = combinations.filter(item => item.unitKey === "linear-equations");
    expect(duplicateCoreCombos).toHaveLength(3); // 仍然只有核心單元原本的三筆，沒有因為自訂單元同代碼而變成六筆。
  });
});

describe("refillPracticeQuestionBank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listApprovedStudentUnits.mockResolvedValue([]);
    mocks.getTutorContext.mockResolvedValue({ name: undefined, rules: "先確認已知條件。", contents: [] });
    mocks.insertPracticeQuestionBankItem.mockResolvedValue(undefined);
    mocks.generatePracticeQuestionWithRetry.mockResolvedValue({ ok: true, generation: CLEAN_GENERATION });
  });

  it("庫存已滿的組合完全跳過，不呼叫 Gemini", async () => {
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts());
    const summary = await refillPracticeQuestionBank();
    expect(summary.combinationsBelowTarget).toBe(0);
    expect(summary.questionsGenerated).toBe(0);
    expect(mocks.generatePracticeQuestionWithRetry).not.toHaveBeenCalled();
  });

  it("只為庫存不足的組合補題，且補到剛好等於目標庫存", async () => {
    const key = "seven::linear-equations::intro";
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts({ [key]: BANK_TARGET_POOL_SIZE - 1 }));
    const summary = await refillPracticeQuestionBank();
    expect(summary.combinationsBelowTarget).toBe(1);
    expect(summary.questionsGenerated).toBe(1);
    expect(summary.questionsFailed).toBe(0);
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(1);
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ grade: "seven", unitKey: "linear-equations", difficulty: "intro" }),
      expect.anything(),
    );
    expect(mocks.insertPracticeQuestionBankItem).toHaveBeenCalledWith(expect.objectContaining({
      grade: "seven", unitKey: "linear-equations", difficulty: "intro", questionText: CLEAN_GENERATION.question,
    }));
  });

  it("單一組合庫存完全掏空時，單次執行最多只補到每組合上限，其餘留給下一次執行", async () => {
    const key = "seven::linear-equations::intro";
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts({ [key]: 0 }));
    const summary = await refillPracticeQuestionBank();
    // BANK_TARGET_POOL_SIZE=6、單組合單次上限=3，缺口是 6，因此這一次只補 3 題。
    expect(summary.questionsGenerated).toBe(3);
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(3);
  });

  it("單一組合生成失敗不會中止其他組合，且完整計入失敗次數", async () => {
    const failingKey = "seven::linear-equations::intro";
    const okKey = "seven::linear-equations::standard";
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts({ [failingKey]: BANK_TARGET_POOL_SIZE - 1, [okKey]: BANK_TARGET_POOL_SIZE - 1 }));
    mocks.generatePracticeQuestionWithRetry.mockImplementation(async (target: { difficulty: string }) => {
      if (target.difficulty === "intro") return { ok: false };
      return { ok: true, generation: CLEAN_GENERATION };
    });
    const summary = await refillPracticeQuestionBank();
    expect(summary.questionsFailed).toBe(1);
    expect(summary.questionsGenerated).toBe(1);
    expect(mocks.generatePracticeQuestionWithRetry).toHaveBeenCalledTimes(2);
  });

  it("拋出例外的組合會被記錄為失敗並繼續處理其餘組合，不會讓整批排程中斷", async () => {
    const failingKey = "seven::linear-equations::intro";
    const okKey = "seven::linear-equations::standard";
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts({ [failingKey]: BANK_TARGET_POOL_SIZE - 1, [okKey]: BANK_TARGET_POOL_SIZE - 1 }));
    mocks.generatePracticeQuestionWithRetry.mockImplementation(async (target: { difficulty: string }) => {
      if (target.difficulty === "intro") throw new Error("Gemini 暫時無法使用");
      return { ok: true, generation: CLEAN_GENERATION };
    });
    await expect(refillPracticeQuestionBank()).resolves.toMatchObject({ questionsFailed: 1, questionsGenerated: 1 });
  });

  it("時間預算不足時提早收手並標記 timedOut，不會硬是把所有缺口補完", async () => {
    mocks.getPracticeQuestionBankPoolCounts.mockResolvedValue(fullPoolCounts({ "seven::linear-equations::intro": 0, "seven::linear-equations::standard": 0 }));
    const summary = await refillPracticeQuestionBank({ timeBudgetMs: 1 }); // 遠低於 MIN_REMAINING_BUDGET_MS，第一個缺口都不會嘗試。
    expect(summary.timedOut).toBe(true);
    expect(mocks.generatePracticeQuestionWithRetry).not.toHaveBeenCalled();
  });
});
