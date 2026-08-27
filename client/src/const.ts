export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { supabaseBrowser } from "@/lib/supabase";

export const startLogin = async (email: string) => {
  const { error } = await supabaseBrowser.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error("無法寄送登入連結，請確認電子郵件後再試。");
};

function currentOrigin(path = "") {
  return `${window.location.origin}${path}`;
}

export async function signUpWithPassword(input: { email: string; password: string; displayName?: string }) {
  const { error } = await supabaseBrowser.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: currentOrigin("/"),
      data: input.displayName?.trim() ? { display_name: input.displayName.trim() } : undefined,
    },
  });
  if (error) throw new Error("暫時無法完成註冊，請確認信箱格式與密碼後再試。");
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabaseBrowser.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error("信箱或密碼不正確；若剛註冊，請先完成信箱驗證。");
}

export async function resendSignupConfirmation(email: string) {
  const { error } = await supabaseBrowser.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: currentOrigin("/") },
  });
  if (error) throw new Error("暫時無法重新寄送驗證信，請稍後再試。");
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: currentOrigin("/reset-password"),
  });
  if (error) throw new Error("暫時無法寄送密碼重設信，請稍後再試。");
}

export async function updatePassword(password: string) {
  const { error } = await supabaseBrowser.auth.updateUser({ password });
  if (error) throw new Error("暫時無法更新密碼，請重新從重設信件開啟連結後再試。");
}
