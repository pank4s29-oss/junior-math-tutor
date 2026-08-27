import { updatePassword } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

function validatePassword(password: string) {
  if (password.length < 10) return "密碼至少需要 10 個字元。";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密碼請同時包含英文字母與數字。";
  return "";
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validatePassword(password);
    if (validationError) return toast.error(validationError);
    if (password !== confirmation) return toast.error("兩次輸入的密碼不一致，請重新確認。");
    setSubmitting(true);
    try {
      await updatePassword(password);
      setPassword(""); setConfirmation("");
      toast.success("密碼已更新，請使用新密碼登入。", { icon: <CheckCircle2 className="size-4" /> });
      setLocation("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暫時無法更新密碼，請稍後再試。");
    } finally { setSubmitting(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-[#f7f8f5] px-4 py-8 text-slate-800"><section className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-[0_22px_50px_-34px_rgba(23,59,77,0.45)]"><div className="bg-[#173b4d] px-6 py-7 text-white"><div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 text-[#f8cf88]"><KeyRound className="size-5" /></div><h1 className="mt-4 font-serif text-2xl">設定新的登入密碼</h1><p className="mt-2 text-sm leading-6 text-slate-200">請只從密碼重設信件開啟此頁面。完成後，你可直接用信箱與新密碼登入。</p></div><form onSubmit={submit} className="space-y-4 p-6"><label className="grid gap-2 text-sm font-medium text-slate-700"><span>新密碼</span><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required className="h-11 rounded-xl border-slate-200" /></label><p className="-mt-2 text-xs leading-5 text-slate-500">至少 10 個字元，且同時包含英文字母與數字。</p><label className="grid gap-2 text-sm font-medium text-slate-700"><span>再次輸入新密碼</span><Input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required className="h-11 rounded-xl border-slate-200" /></label><Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在更新</> : "更新密碼"}</Button><Link href="/" className="block text-center text-sm font-semibold text-[#196b63] hover:underline">回到解題工作區</Link></form></section></main>;
}
