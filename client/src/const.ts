export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { supabaseBrowser } from "@/lib/supabase";

export const startLogin = async (email: string) => {
  const { error } = await supabaseBrowser.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error("無法寄送登入連結，請確認電子郵件後再試。");
};
