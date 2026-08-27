import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabaseBrowser: { auth } }));

import { requestPasswordReset, resendSignupConfirmation, signInWithPassword, signUpWithPassword, updatePassword } from "../client/src/const";

describe("Supabase 自助帳密流程", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { origin: "https://junior-math.example" } });
    auth.signUp.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.resend.mockResolvedValue({ error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
  });

  it("新使用者以信箱與密碼自行註冊，只傳遞顯示名稱且要求回到核准網域驗證", async () => {
    await signUpWithPassword({ email: " new.student@example.com ", password: "SafePass123", displayName: "新同學" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new.student@example.com",
      password: "SafePass123",
      options: { emailRedirectTo: "https://junior-math.example/", data: { display_name: "新同學" } },
    });
    expect(auth.signUp.mock.calls[0][0].options.data).not.toHaveProperty("role");
  });

  it("已驗證帳號使用信箱與密碼登入，並可安全使用驗證信與密碼重設流程", async () => {
    await signInWithPassword(" learner@example.com ", "SafePass123");
    await resendSignupConfirmation(" learner@example.com ");
    await requestPasswordReset(" learner@example.com ");
    await updatePassword("NewSafePass123");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "learner@example.com", password: "SafePass123" });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "learner@example.com", options: { emailRedirectTo: "https://junior-math.example/" } });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("learner@example.com", { redirectTo: "https://junior-math.example/reset-password" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "NewSafePass123" });
  });

  it("不把 Supabase 驗證細節直接回傳至畫面，避免洩漏帳號資訊", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    await expect(signInWithPassword("learner@example.com", "SafePass123")).rejects.toThrow("信箱或密碼不正確");
  });
});
