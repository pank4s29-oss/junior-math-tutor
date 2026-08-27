import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AuthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await startLogin(email);
      toast.success("登入連結已寄出。請到信箱開啟連結後回到這裡繼續學習。");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "目前無法寄送登入連結，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md rounded-[1.75rem] border-slate-200 bg-white p-6">
      <DialogHeader>
        <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-[#e9f4f1] text-[#196b63]"><MailCheck className="size-5" /></div>
        <DialogTitle className="font-serif text-xl text-[#173b4d]">登入你的學習空間</DialogTitle>
        <DialogDescription className="leading-6 text-slate-500">輸入電子郵件後，我們會寄送一次性安全登入連結。學生不需要提供任何 API Key。</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="mt-3 space-y-4">
        <div className="space-y-2"><Label htmlFor="auth-email">電子郵件</Label><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="student@example.com" className="h-11 rounded-xl border-slate-200" /></div>
        <Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />正在寄送登入連結</> : "寄送安全登入連結"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
