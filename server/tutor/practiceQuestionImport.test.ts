import { describe, expect, it } from "vitest";
import { parsePracticeQuestionCsv } from "./practiceQuestionImport";

describe("parsePracticeQuestionCsv", () => {
  it("依中文表頭解析標準四欄 CSV，且能正確處理引號內含逗號的題目內容", () => {
    const csv = [
      "難度,題目,關鍵觀念,難度說明",
      "入門,\"解 $3x - 7 = 11$，求 $x$。\",移項與等量公理,單一步驟即可求解。",
      "進階,\"已知 $a, b, c$ 為正整數，求 $a+b+c$ 的最小值。\",,",
    ].join("\n");
    const result = parsePracticeQuestionCsv(csv, "standard");
    expect(result.skipped).toEqual([]);
    expect(result.rows).toEqual([
      { difficulty: "intro", questionText: "解 $3x - 7 = 11$，求 $x$。", keyConcept: "移項與等量公理", difficultyNote: "單一步驟即可求解。" },
      { difficulty: "challenge", questionText: "已知 $a, b, c$ 為正整數，求 $a+b+c$ 的最小值。", keyConcept: "", difficultyNote: "" },
    ]);
  });

  it("難度欄留空時套用呼叫端傳入的預設難度", () => {
    const csv = ["難度,題目", ",解 $x + 1 = 2$。"].join("\n");
    const result = parsePracticeQuestionCsv(csv, "challenge");
    expect(result.rows).toEqual([{ difficulty: "challenge", questionText: "解 $x + 1 = 2$。", keyConcept: "", difficultyNote: "" }]);
  });

  it("沒有可辨識表頭時，退回固定欄位順序（難度、題目、關鍵觀念、難度說明）", () => {
    const csv = "基礎,解 $2x=8$，求 x。,一元一次方程式,";
    const result = parsePracticeQuestionCsv(csv, "intro");
    expect(result.rows).toEqual([{ difficulty: "standard", questionText: "解 $2x=8$，求 x。", keyConcept: "一元一次方程式", difficultyNote: "" }]);
  });

  it("個別欄位有問題的行會被跳過並附上原因，不影響其餘正常的行", () => {
    const csv = [
      "難度,題目",
      "入門,x", // 題目太短
      "火星,解 $x=1$。", // 無法辨識的難度
      "基礎,解 $2x=6$，求 x。", // 正常
      ",,,", // 整行空白，靜默跳過，不計入 skipped
    ].join("\n");
    const result = parsePracticeQuestionCsv(csv, "standard");
    expect(result.rows).toEqual([{ difficulty: "standard", questionText: "解 $2x=6$，求 x。", keyConcept: "", difficultyNote: "" }]);
    expect(result.skipped).toEqual([
      { line: 2, reason: "題目內容太短（至少需要 4 個字）或是空白。" },
      { line: 3, reason: "無法辨識的難度「火星」，請填寫入門／基礎／進階，或留空套用目前選取的預設難度。" },
    ]);
  });

  it("空檔案回報明確錯誤，而不是靜默回傳空陣列", () => {
    const result = parsePracticeQuestionCsv("", "standard");
    expect(result.rows).toEqual([]);
    expect(result.skipped).toEqual([{ line: 1, reason: "檔案是空的。" }]);
  });

  it("有表頭但找不到「題目」欄位時，回報清楚的錯誤原因", () => {
    const result = parsePracticeQuestionCsv("難度,關鍵觀念\n入門,移項", "standard");
    expect(result.rows).toEqual([]);
    expect(result.skipped).toEqual([{ line: 1, reason: "找不到「題目」欄位，請確認表頭包含「題目」這個欄位名稱，或參考範本檔案的格式。" }]);
  });

  it("正確處理雙引號逸出（\"\" 代表欄位內的一個雙引號字元）與 CRLF 換行", () => {
    const csv = "題目\r\n\"這題引用 \"\"畢氏定理\"\" 求斜邊長。\"\r\n";
    const result = parsePracticeQuestionCsv(csv, "standard");
    expect(result.rows).toEqual([{ difficulty: "standard", questionText: "這題引用 \"畢氏定理\" 求斜邊長。", keyConcept: "", difficultyNote: "" }]);
  });

  it("超過單次匯入上限時，多出的行會被跳過並說明原因", () => {
    const header = "題目";
    const dataLines = Array.from({ length: 201 }, (_, index) => `第 ${index + 1} 題，內容足夠長。`);
    const csv = [header, ...dataLines].join("\n");
    const result = parsePracticeQuestionCsv(csv, "standard");
    expect(result.rows).toHaveLength(200);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("已超過單次匯入上限 200 題");
  });
});
