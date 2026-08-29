import { describe, expect, it } from "vitest";
import { validateBatchQuestionCount } from "./supabaseDb";

describe("多題解題工作階段上限", () => {
  it("允許 5 題上限內的有效批次", () => {
    expect(validateBatchQuestionCount(1, 5)).toBe(true);
    expect(validateBatchQuestionCount(5, 5)).toBe(true);
    expect(validateBatchQuestionCount(10, 10)).toBe(true);
  });

  it("拒絕超過教師上限、零題與不支援的上限值", () => {
    expect(validateBatchQuestionCount(6, 5)).toBe(false);
    expect(validateBatchQuestionCount(11, 10)).toBe(false);
    expect(validateBatchQuestionCount(0, 5)).toBe(false);
    expect(validateBatchQuestionCount(2.5, 5)).toBe(false);
    expect(validateBatchQuestionCount(3, 8)).toBe(false);
  });
});
