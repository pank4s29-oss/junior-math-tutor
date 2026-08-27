import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsertUser: vi.fn(), getUserByOpenId: vi.fn(), mapUser: vi.fn(), exchangeCodeForToken: vi.fn(), getUserInfo: vi.fn(), createSessionToken: vi.fn() }));
vi.mock("../db", () => ({ upsertUser: mocks.upsertUser, getUserByOpenId: mocks.getUserByOpenId }));
vi.mock("../tutor/supabaseDb", () => ({ getOrCreateAppUser: mocks.mapUser }));
vi.mock("./sdk", () => ({ sdk: { exchangeCodeForToken: mocks.exchangeCodeForToken, getUserInfo: mocks.getUserInfo, createSessionToken: mocks.createSessionToken } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ path: "/" }) }));
vi.mock("@shared/const", () => ({ COOKIE_NAME: "session", ONE_YEAR_MS: 1000, OAUTH_STATE_COOKIE: "oauth_state", decodeOAuthState: () => ({ nonce: "nonce-1" }) }));

import { registerOAuthRoutes } from "./oauth";

describe("OAuth Supabase 身分映射", () => {
  it("在登入成功與 session 建立前同步既有帳號的 Supabase 對應", async () => {
    const savedUser = { id: 1, openId: "teacher-1", name: "Teacher", email: "teacher@example.com", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    mocks.exchangeCodeForToken.mockResolvedValue({ accessToken: "token" }); mocks.getUserInfo.mockResolvedValue({ openId: "teacher-1", name: "Teacher", email: "teacher@example.com" }); mocks.getUserByOpenId.mockResolvedValue(savedUser); mocks.createSessionToken.mockResolvedValue("signed-session");
    let callback: ((req: any, res: any) => Promise<void>) | undefined;
    registerOAuthRoutes({ get: (_path: string, handler: typeof callback) => { callback = handler; } } as any);
    const response = { clearCookie: vi.fn(), cookie: vi.fn(), redirect: vi.fn(), status: vi.fn(() => response), json: vi.fn() };
    await callback?.({ query: { code: "code", state: "state" }, headers: { cookie: "oauth_state=nonce-1" } }, response);
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "teacher-1" }));
    expect(mocks.mapUser).toHaveBeenCalledWith(savedUser);
    expect(response.cookie).toHaveBeenCalledWith("session", "signed-session", expect.any(Object));
    expect(response.redirect).toHaveBeenCalledWith(302, "/");
  });
});
