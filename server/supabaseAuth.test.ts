import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("./supabase", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));

import { authenticateSupabaseRequest, getBearerToken } from "./supabaseAuth";

describe("Supabase Auth 伺服器端驗證", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.getSupabaseServerClient.mockReturnValue({ from: mocks.from });
    mocks.maybeSingle.mockResolvedValue({ data: { display_name: "林老師", role: "teacher" }, error: null });
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  it("只接受標準 Bearer access token", () => {
    expect(getBearerToken({ headers: { authorization: "Bearer access-token" } } as never)).toBe("access-token");
    expect(getBearerToken({ headers: { authorization: "Basic access-token" } } as never)).toBeUndefined();
  });

  it("向 Auth 驗證 token，並只從 server-side profile 取得管理角色", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      email: "teacher@example.com",
      user_metadata: { full_name: "不可信前端名稱" },
    }), { status: 200 }));

    await expect(authenticateSupabaseRequest({ headers: { authorization: "Bearer access-token" } } as never))
      .resolves.toMatchObject({ id: "11111111-1111-4111-8111-111111111111", name: "林老師", role: "teacher", loginMethod: "supabase" });
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer access-token" }),
    }));
  });

  it("拒絕無效 token 或缺少 profile 的帳號", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    await expect(authenticateSupabaseRequest({ headers: { authorization: "Bearer bad-token" } } as never)).resolves.toBeNull();
  });

  it("在有效 token 沒有 profile 時拒絕建立 session，避免 role 尚未安全初始化", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 }));
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(authenticateSupabaseRequest({ headers: { authorization: "Bearer access-token" } } as never)).resolves.toBeNull();
  });

  it("使用受保護 profile 的 student 預設值，而非 JWT metadata 的角色主張", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      user_metadata: { role: "admin" },
    }), { status: 200 }));
    mocks.maybeSingle.mockResolvedValue({ data: { display_name: "新同學", role: "student" }, error: null });
    await expect(authenticateSupabaseRequest({ headers: { authorization: "Bearer access-token" } } as never))
      .resolves.toMatchObject({ name: "新同學", role: "user" });
  });

  it("專案已提供 JWKS 時，以本地驗簽完成驗證，完全不呼叫 /auth/v1/user", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const kid = "test-key-1";
    const userId = "22222222-2222-4222-8222-222222222222";
    const token = await new SignJWT({ email: "student@example.com" })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer("https://example.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = typeof input === "string" ? input : (input as URL | Request).toString();
      if (url.includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: "ES256", use: "sig" }] }), { status: 200 });
      }
      throw new Error(`未預期呼叫 /auth/v1/user：${url}`);
    });
    mocks.maybeSingle.mockResolvedValue({ data: { display_name: "本地驗簽同學", role: "student" }, error: null });

    await expect(authenticateSupabaseRequest({ headers: { authorization: `Bearer ${token}` } } as never))
      .resolves.toMatchObject({ id: userId, name: "本地驗簽同學", role: "user", loginMethod: "supabase" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/.well-known/jwks.json");
  });
});
