import { requestPasswordReset, resendSignupConfirmation, signInWithPassword, signUpWithPassword, startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, KeyRound, Loader2, MailCheck, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AuthView = "sign-in" | "sign-up" | "verify" | "reset" | "magic-link";

function validatePassword(password: string) {
  if (password.length < 10) return "密碼至少需要 10 個字元。";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密碼請同時包含英文字母與數字。";
  return "";
}

export function AuthDialogNext({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = (nextOpen: boolean) => {
    if (!nextOpen) { setPassword(""); setPasswordConfirmation(""); setSubmitting(false); }
    onOpenChange(nextOpen);
  };
  const run = async (operation: () => Promise<void>) => {
    setSubmitting(true);
    try { await operation(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "目前無法完成操作，請稍後再試。"); }
    finally { setSubmitting(false); }
  };
  const submitSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => { await signInWithPassword(email, password); close(false); toast.success("登入成功，已回到你的學習空間。", { icon: <CheckCircle2 className="size-4" /> }); });
  };
  const submitSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) return toast.error(passwordError);
    if (password !== passwordConfirmation) return toast.error("兩次輸入的密碼不一致，請重新確認。");
    void run(async () => { await signUpWithPassword({ email, password, displayName }); setPassword(""); setPasswordConfirmation(""); setView("verify"); });
  };
  const submitReset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => { await requestPasswordReset(email); setView("sign-in"); toast.success("若此信箱已註冊，重設密碼說明已寄出。請查看收件匣與垃圾郵件資料夾。"); });
  };
  const submitMagicLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => { await startLogin(email); close(false); toast.success("登入連結已寄出。請到信箱開啟連結後回到這裡繼續學習。"); });
  };
  const passwordHint = password ? validatePassword(password) : "至少 10 個字元，且同時包含英文字母與數字。";

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-w-md overflow-hidden rounded-[1.75rem] border-slate-200 bg-white p-0">
      <div className="bg-[#173b4d] px-6 pb-5 pt-6 text-white"><div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 text-[#f8cf88]">{view === "sign-up" ? <Sparkles className="size-5" /> : <KeyRound className="size-5" />}</div><DialogHeader className="mt-4"><DialogTitle className="font-serif text-xl text-white">{view === "sign-up" ? "建立你的學習帳號" : view === "verify" ? "確認你的電子郵件" : view === "reset" ? "重設登入密碼" : view === "magic-link" ? "使用安全登入連結" : "登入你的學習空間"}</DialogTitle><DialogDescription className="leading-6 text-slate-200">{view === "sign-up" ? "設定密碼後，請完成第一次信箱驗證；之後即可直接以信箱與密碼登入。" : view === "verify" ? "為保護帳號，請先到信箱完成驗證；設定的密碼會在驗證後啟用。" : view === "reset" ? "我們會以不透露帳號是否存在的方式處理重設請求。" : view === "magic-link" ? "這是帳密登入以外的替代方式；一次性連結會寄到你的信箱。" : "使用你的電子郵件與密碼登入。學生不需要提供任何 API Key。"}</DialogDescription></DialogHeader></div>
      <div className="p-6">
        {(view === "sign-in" || view === "sign-up") && <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#f2f5f4] p-1"><button type="button" onClick={() => setView("sign-in")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "sign-in" ? "bg-white text-[#173b4d] shadow-sm" : "text-slate-500"}`}>登入</button><button type="button" onClick={() => setView("sign-up")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === "sign-up" ? "bg-white text-[#173b4d] shadow-sm" : "text-slate-500"}`}>註冊</button></div>}
        {view === "sign-in" && <form onSubmit={submitSignIn} className="space-y-4"><EmailField value={email} onChange={setEmail} /><PasswordField value={password} onChange={setPassword} label="密碼" autoComplete="current-password" /><Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在登入</> : "以信箱與密碼登入"}</Button><div className="flex items-center justify-between gap-3 text-xs"><button type="button" onClick={() => setView("reset")} className="font-medium text-[#196b63] hover:underline">忘記密碼？</button><button type="button" onClick={() => setView("magic-link")} className="font-medium text-slate-500 hover:text-[#196b63] hover:underline">改用登入連結</button></div></form>}
        {view === "sign-up" && <form onSubmit={submitSignUp} className="space-y-4"><div className="space-y-2"><Label htmlFor="auth-display-name">顯示名稱 <span className="font-normal text-slate-400">（選填）</span></Label><Input id="auth-display-name" autoComplete="name" maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="例如 小明" className="h-11 rounded-xl border-slate-200" /></div><EmailField value={email} onChange={setEmail} /><PasswordField value={password} onChange={setPassword} label="設定密碼" autoComplete="new-password" /><p className={`-mt-2 text-xs ${validatePassword(password) ? "text-slate-500" : password ? "text-[#196b63]" : "text-slate-500"}`}>{password ? (validatePassword(password) || "密碼強度符合基本要求。") : passwordHint}</p><PasswordField value={passwordConfirmation} onChange={setPasswordConfirmation} label="再次輸入密碼" autoComplete="new-password" /><Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#196b63] hover:bg-[#115950]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在建立帳號</> : "註冊並寄送驗證信"}</Button><p className="text-center text-xs leading-5 text-slate-500">新帳號預設為學生身分；教師與管理者權限只會由專案管理者在受保護的資料庫授權。</p></form>}
        {view === "verify" && <div className="space-y-4"><div className="rounded-2xl bg-[#eaf6f3] p-4 text-sm leading-6 text-[#135c54]"><MailCheck className="mb-2 size-5" />若此信箱可完成註冊，驗證信已寄出。請開啟信內連結回到網站，之後可用剛設定的密碼登入。</div><Button type="button" onClick={() => void run(async () => { await resendSignupConfirmation(email); toast.success("若帳號仍待驗證，新的驗證信已寄出。請查看收件匣與垃圾郵件資料夾。"); })} disabled={submitting} variant="outline" className="h-11 w-full rounded-xl border-[#9acfc6] text-[#196b63]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在處理</> : <><RotateCcw className="mr-2 size-4" />重新寄送驗證信</>}</Button><button type="button" onClick={() => setView("sign-in")} className="w-full text-sm font-semibold text-[#173b4d] hover:underline">我已完成驗證，前往登入</button></div>}
        {view === "reset" && <form onSubmit={submitReset} className="space-y-4"><EmailField value={email} onChange={setEmail} /><Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在寄送</> : "寄送密碼重設說明"}</Button><button type="button" onClick={() => setView("sign-in")} className="w-full text-sm font-semibold text-[#196b63] hover:underline">回到登入</button></form>}
        {view === "magic-link" && <form onSubmit={submitMagicLink} className="space-y-4"><EmailField value={email} onChange={setEmail} /><Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在寄送</> : "寄送一次性登入連結"}</Button><button type="button" onClick={() => setView("sign-in")} className="w-full text-sm font-semibold text-[#196b63] hover:underline">回到帳密登入</button></form>}
      </div>
    </DialogContent>
  </Dialog>;
}

function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label htmlFor="auth-email">電子郵件</Label><Input id="auth-email" type="email" autoComplete="email" required value={value} onChange={event => onChange(event.target.value)} placeholder="student@example.com" className="h-11 rounded-xl border-slate-200" /></div>; }
function PasswordField({ value, onChange, label, autoComplete }: { value: string; onChange: (value: string) => void; label: string; autoComplete: "current-password" | "new-password" }) { return <div className="space-y-2"><Label htmlFor={`auth-${autoComplete}-${label}`}>{label}</Label><Input id={`auth-${autoComplete}-${label}`} type="password" autoComplete={autoComplete} required value={value} onChange={event => onChange(event.target.value)} className="h-11 rounded-xl border-slate-200" /></div>; }
