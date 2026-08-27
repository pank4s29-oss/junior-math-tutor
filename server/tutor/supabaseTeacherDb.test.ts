import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), returns: vi.fn(), maybeSingle: vi.fn(), getSupabaseServerClient: vi.fn() }));

vi.mock("../supabase", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));

import { getApprovedStudentUnit, listApprovedStudentUnits } from "./supabaseTeacherDb";

describe("教師單元學生可見資料層", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseServerClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, order: mocks.order, maybeSingle: mocks.maybeSingle });
    mocks.order.mockReturnValue({ order: mocks.order, returns: mocks.returns });
  });

  it("清單只查詢已核准單元，並不把教師規則或草稿送往學生端", async () => {
    mocks.returns.mockResolvedValue({ data: [{ grade: "seven", unit_key: "probability-tree", name: "樹狀圖與條件機率" }], error: null });
    await expect(listApprovedStudentUnits()).resolves.toEqual([{ grade: "seven", key: "probability-tree", label: "樹狀圖與條件機率" }]);
    expect(mocks.from).toHaveBeenCalledWith("teacher_units");
    expect(mocks.select).toHaveBeenCalledWith("grade, unit_key, name");
    expect(mocks.eq).toHaveBeenCalledWith("is_approved", true);
  });

  it("個別自訂單元解題前也必須通過已核准條件", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getApprovedStudentUnit("seven", "draft-probability")).resolves.toBeUndefined();
    expect(mocks.eq).toHaveBeenCalledWith("grade", "seven");
    expect(mocks.eq).toHaveBeenCalledWith("unit_key", "draft-probability");
    expect(mocks.eq).toHaveBeenCalledWith("is_approved", true);
  });
});
