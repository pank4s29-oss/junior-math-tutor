import { describe, expect, it } from "vitest";
import { getTutorContext, listTeacherContents, listTeacherUnits } from "./supabaseTeacherDb";

describe("Supabase 教師資料層", () => {
  it("可讀取教師工作台資料表，並在尚無核准內容時安全回傳空集合", async () => {
    const [units, contents, context] = await Promise.all([
      listTeacherUnits(),
      listTeacherContents(),
      getTutorContext("seven", "linear-equations"),
    ]);

    expect(Array.isArray(units)).toBe(true);
    expect(Array.isArray(contents)).toBe(true);
    expect(context).toHaveProperty("rules");
    expect(Array.isArray(context.contents)).toBe(true);
  });
});
