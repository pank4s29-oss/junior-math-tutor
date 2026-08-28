import { describe, expect, it } from "vitest";
import { buildLearningInsights, buildPracticeSheet } from "./supabaseDb";

const attempts = [
  { id: "a", questionText: "解 3x - 7 = 11", unitKey: "linear-equations", errorTags: JSON.stringify(["移項符號", "代入計算"]), studentMarkedWrong: true },
  { id: "b", questionText: "化簡 √72", unitKey: "roots-pythagorean", errorTags: JSON.stringify(["公式選擇"]), studentMarkedWrong: true },
  { id: "c", questionText: "展開 (x+2)²", unitKey: "polynomials", errorTags: JSON.stringify(["分配律"]), studentMarkedWrong: false },
] as any;

describe("學生常犯錯題學習整理", () => {
  it("只由學生主動標記的題目彙整重點與下一步建議", () => {
    const result = buildLearningInsights(attempts);
    expect(result).toMatchObject({ recentCount: 3, frequentCount: 2, focusUnit: "linear-equations" });
    expect(result.topTags).toContainEqual({ tag: "移項符號", count: 1 });
    expect(result.recommendation).toContain("已標記 2 題");
    expect(result.nextSteps).toHaveLength(3);
  });

  it("匯出練習單只保留學生自己的題幹與作答空白，不含解答或模型內容", () => {
    const frequent = buildPracticeSheet(attempts, "frequent");
    const recent = buildPracticeSheet(attempts, "recent");
    expect(frequent).toContain("常犯錯題練習單");
    expect(frequent).toContain("解 3x - 7 = 11");
    expect(frequent).not.toContain("展開 (x+2)²");
    expect(recent).toContain("近期學習紀錄練習單");
    expect(recent).toContain("展開 (x+2)²");
    expect(recent).toContain("我的作法：");
    expect(recent).not.toContain("答案");
  });
});
