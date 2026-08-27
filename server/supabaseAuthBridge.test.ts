import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { query = mocks.query; end = mocks.end; } }));

import { resolveSupabaseAuthUserId } from "./supabaseAuthBridge";

describe("Supabase Auth 身分橋接", () => {
  it("只以登入帳號的相符電子郵件查詢 auth.users 與 profile", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] });
    await expect(resolveSupabaseAuthUserId("teacher@example.com")).resolves.toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("join public.profiles"), ["teacher@example.com"]);
  });
  it("沒有電子郵件時不查詢任何 Supabase Auth 資料", async () => {
    await expect(resolveSupabaseAuthUserId(undefined)).resolves.toBeUndefined();
  });
});
