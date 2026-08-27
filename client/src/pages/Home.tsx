import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CORE_UNITS, GRADE_LABELS, MODE_LABELS, type Grade, type TutorMode } from "../../../shared/mathCurriculum";
import { AlertCircle, ArrowRight, BadgeCheck, BookOpenCheck, CheckCircle2, CircleHelp, Clock3, FileWarning, GraduationCap, Lightbulb, Loader2, NotebookPen, ShieldCheck, Sparkles, Upload, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { Link } from "wouter";

type PendingAttachment = { file: File; preview: string };
type LastAttempt = { id: number; variationQuestion: string; confidence: number; needsClarification: boolean };

const MODE_DETAILS: Record<TutorMode, { description: string; icon: typeof Lightbulb }> = {
  guided: { description: "先給下一步提示，不急著揭露答案。", icon: Lightbulb },
  step_by_step: { description: "把推理、算式與理由完整說清楚。", icon: BookOpenCheck },
  check: { description: "檢查你的過程，找出第一個可修正處。", icon: CheckCircle2 },
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("題目照片讀取失敗，請重新選擇檔案。"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [grade, setGrade] = useState<Grade>("seven");
  const [unitKey, setUnitKey] = useState(CORE_UNITS.seven[0].key);
  const [mode, setMode] = useState<TutorMode>("guided");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);

  const units = useMemo(() => CORE_UNITS[grade], [grade]);
  const unit = units.find(item => item.key === unitKey) ?? units[0];
  const history = trpc.tutor.learningLoop.useQuery(undefined, { enabled: isAuthenticated });
  const uploadPhoto = trpc.tutor.uploadPhoto.useMutation();
  const solve = trpc.tutor.solve.useMutation();
  const reportConcern = trpc.tutor.reportConcern.useMutation();
  const savePractice = trpc.tutor.savePractice.useMutation();

  const switchGrade = (nextGrade: Grade) => {
    setGrade(nextGrade);
    setUnitKey(CORE_UNITS[nextGrade][0].key);
  };

  const selectAttachment = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("請上傳 JPEG、PNG 或 WebP 格式的題目照片。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("題目照片需小於 5MB，請壓縮或重新拍攝。");
      return;
    }
    setAttachment({ file, preview: URL.createObjectURL(file) });
    toast.success("已附上題目照片，送出後我會先確認辨識是否可靠。");
  };

  const sendQuestion = async (question: string) => {
    if (!isAuthenticated) {
      toast.message("請先登入，再開始保存你的解題與錯題紀錄。");
      startLogin();
      return;
    }
    setMessages(current => [...current, { role: "user", content: question }]);
    setLastAttempt(null);
    try {
      let attachmentId: number | undefined;
      if (attachment) {
        const dataUrl = await fileToDataUrl(attachment.file);
        const uploaded = await uploadPhoto.mutateAsync({ filename: attachment.file.name, mimeType: attachment.file.type as "image/jpeg" | "image/png" | "image/webp", dataUrl });
        attachmentId = uploaded.attachmentId;
      }
      const result = await solve.mutateAsync({ question, grade, unitKey: unit.key, mode, attachmentId });
      setMessages(current => [...current, { role: "assistant", content: result.responseMarkdown }]);
      setLastAttempt({ id: result.attemptId, variationQuestion: result.solution.variationQuestion, confidence: result.solution.confidence, needsClarification: result.solution.needsClarification });
      setRemaining(result.remaining);
      setAttachment(null);
      history.refetch();
      if (result.solution.needsClarification) toast.message("我需要更多題目資訊，請依回覆補拍或補充文字。", { icon: <CircleHelp className="size-4" /> });
    } catch (error) {
      const message = error instanceof Error ? error.message : "解題服務暫時無法使用，請稍後再試。";
      toast.error(message);
      setMessages(current => [...current, { role: "assistant", content: "## 暫時無法可靠作答\n我現在無法完成這題的安全檢查。請稍候再試，或改為補上清楚題目與你的作答步驟。\n\n> AI 可能出錯；重要答案請與教師或可驗算步驟交叉確認。" }]);
    }
  };

  const report = async (reason: "wrong_answer" | "teacher_help" | "unclear_photo") => {
    if (!lastAttempt) return;
    try {
      const result = await reportConcern.mutateAsync({ attemptId: lastAttempt.id, reason });
      toast.success(result.notified ? "已通知教師，會納入品質檢查。" : "已記錄回報，教師工作台會顯示此項目。");
    } catch {
      toast.error("回報暫時未送出，請稍後再試。");
    }
  };

  const saveVariation = async (status: "not_attempted" | "correct" | "incorrect" | "needs_review") => {
    if (!lastAttempt) return;
    try {
      await savePractice.mutateAsync({ sourceAttemptId: lastAttempt.id, question: lastAttempt.variationQuestion, studentAnswer: practiceAnswer || undefined, status });
      toast.success("變式練習已加入你的學習紀錄。");
      setPracticeAnswer("");
      history.refetch();
    } catch {
      toast.error("暫時無法保存練習結果，請稍後再試。");
    }
  };

  const activeMode = MODE_DETAILS[mode];
  const ModeIcon = activeMode.icon;

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-slate-800 selection:bg-[#b9e1d9] selection:text-[#173b4d]">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-[#f7f8f5]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-2xl bg-[#173b4d] text-[#f8cf88] shadow-lg shadow-[#173b4d]/15"><span className="font-serif text-xl font-semibold">∑</span></div><div><p className="text-sm font-bold tracking-tight text-[#173b4d]">數域・解題教練</p><p className="text-[11px] tracking-[0.14em] text-slate-500">JUNIOR MATH STUDIO</p></div></div>
          {loading ? <Loader2 className="size-5 animate-spin text-slate-400" /> : isAuthenticated ? <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100"><UserRoundCheck className="size-3.5 text-[#196b63]" /><span className="hidden sm:inline">{user?.name || "我的學習空間"}</span><span className="sm:hidden">已登入</span></div> : <Button onClick={startLogin} size="sm" className="rounded-full bg-[#173b4d] px-4 text-xs hover:bg-[#0f2e3d]">登入學習空間</Button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-8">
          <div className="min-w-0">
            <div className="mb-5 rounded-[1.75rem] bg-[#173b4d] px-5 py-6 text-white shadow-[0_20px_50px_-30px_rgba(23,59,77,0.65)] sm:px-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-medium tracking-[0.18em] text-[#f8cf88]">YOUR THINKING, STEP BY STEP</p><h1 className="font-serif text-3xl tracking-tight sm:text-4xl">先理解，再解出來。</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-200">依照你的程度與選擇的學習模式，整理題意、關鍵觀念、每一步理由、驗算與易錯點。</p></div><div className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs text-slate-100"><ShieldCheck className="size-4 text-[#8ed6ca]" />品牌託管模型・學生不需 API Key</div></div>
            </div>

            <section aria-label="學習設定" className="mb-5 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">01　設定今天的學習範圍</p><p className="mt-1 text-sm text-slate-500">選擇年級與單元，讓我使用合適的教學規則。</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><BadgeCheck className="size-4 text-[#196b63]" />教師核准內容優先</div></div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{(["seven", "eight", "nine"] as Grade[]).map(item => <button key={item} onClick={() => switchGrade(item)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${grade === item ? "bg-[#196b63] text-white shadow-sm" : "bg-[#f2f5f4] text-slate-600 hover:bg-[#e4efed]"}`}>{GRADE_LABELS[item]}</button>)}</div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{units.map(item => <button key={item.key} onClick={() => setUnitKey(item.key)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition ${unit.key === item.key ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>{item.label}</button>)}</div>
            </section>

            <section aria-label="解題模式" className="mb-5 grid gap-2 sm:grid-cols-3">{(["guided", "step_by_step", "check"] as TutorMode[]).map(item => { const Icon = MODE_DETAILS[item].icon; const selected = mode === item; return <button key={item} onClick={() => setMode(item)} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-[#196b63] bg-[#eaf6f3] shadow-[0_12px_25px_-20px_rgba(25,107,99,0.7)]" : "border-slate-200 bg-white hover:border-[#a7d4cd] hover:bg-[#fcfefd]"}`}><div className="flex items-center gap-2"><div className={`flex size-8 items-center justify-center rounded-xl ${selected ? "bg-[#196b63] text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="size-4" /></div><span className="text-sm font-semibold text-slate-800">{MODE_LABELS[item]}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{MODE_DETAILS[item].description}</p></button>; })}</section>

            {!isAuthenticated && !loading && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f2dba9] bg-[#fff9ea] p-4 text-sm text-[#74511b]"><AlertCircle className="mt-0.5 size-5 shrink-0" /><p>你可以先瀏覽介面；登入後才會啟用安全上傳、品牌託管解題、錯題保存與教師協助通知。</p></div>}
            <AIChatBox messages={messages} onSendMessage={sendQuestion} onAttachmentSelected={selectAttachment} onClearAttachment={() => setAttachment(null)} attachmentName={attachment?.file.name} isLoading={solve.isPending || uploadPhoto.isPending} suggestedPrompts={["解 3x − 7 = 11，先給我提示", "我不懂負數相乘的規則", "幫我檢查：2(x+3)=16，我算 x=5"]} />

            {lastAttempt && <section className="mt-5 rounded-[1.5rem] border border-[#d8ebe7] bg-[#f7fcfa] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#173b4d]"><NotebookPen className="size-4 text-[#196b63]" />把這題變成你的學習資產</p><p className="mt-1 text-xs leading-5 text-slate-500">信心指標 {lastAttempt.confidence}%{lastAttempt.needsClarification ? "・需要補充題目資訊" : "・已完成結構化解題"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => report("wrong_answer")} disabled={reportConcern.isPending} className="rounded-full border-[#eacbc2] bg-white text-[#9a4331] hover:bg-[#fff5f2]"><FileWarning className="mr-1.5 size-3.5" />回報答案問題</Button><Button size="sm" onClick={() => report("teacher_help")} disabled={reportConcern.isPending} className="rounded-full bg-[#173b4d] hover:bg-[#0f2e3d]"><GraduationCap className="mr-1.5 size-3.5" />請教師協助</Button></div></div>
              <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-[#d8ebe7]"><p className="text-xs font-semibold text-[#196b63]">變式練習</p><p className="mt-1 text-sm leading-6 text-slate-700">{lastAttempt.variationQuestion}</p><Textarea value={practiceAnswer} onChange={event => setPracticeAnswer(event.target.value)} placeholder="可先寫下你的答案或思路，之後再回來檢查。" className="mt-3 min-h-20 border-slate-200 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => saveVariation("not_attempted")} disabled={savePractice.isPending} className="rounded-full">稍後練習</Button><Button size="sm" variant="outline" onClick={() => saveVariation("needs_review")} disabled={savePractice.isPending} className="rounded-full">完成，請幫我回顧</Button><Button size="sm" onClick={() => saveVariation("correct")} disabled={savePractice.isPending} className="rounded-full bg-[#196b63] hover:bg-[#115950]">我已完成</Button></div></div>
            </section>}
          </div>

          <aside className="space-y-5 lg:pt-1">
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">TODAY'S FOCUS</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-[#173b4d]">{GRADE_LABELS[grade]}・{unit.label}</h2></div><div className="flex size-10 items-center justify-center rounded-2xl bg-[#f4e8d6] text-[#9a5b21]"><ModeIcon className="size-5" /></div></div><div className="mt-5 rounded-2xl bg-[#f7f8f5] p-3"><p className="text-xs text-slate-500">目前模式</p><p className="mt-1 text-sm font-semibold text-slate-700">{MODE_LABELS[mode]}</p><p className="mt-1 text-xs leading-5 text-slate-500">{activeMode.description}</p></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs"><span className="flex items-center gap-1.5 text-slate-500"><Clock3 className="size-3.5" />每日安全額度</span><span className="font-semibold text-[#196b63]">{remaining === null ? "20 題上限" : `今日剩餘 ${remaining} 題`}</span></div></section>
            <section className="rounded-[1.5rem] bg-[#e9f4f1] p-5"><p className="flex items-center gap-2 text-sm font-semibold text-[#173b4d]"><ShieldCheck className="size-4 text-[#196b63]" />可靠解題守則</p><div className="mt-4 space-y-3 text-xs leading-5 text-slate-600"><p>先確認題意；照片模糊或條件不足時，會請你補拍或補充文字。</p><p>每次回覆固定提供題意、關鍵觀念、步驟理由、驗算與易錯點。</p><p>AI 可能犯錯；重要答案請檢查步驟，或直接請教師協助。</p></div></section>
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">我的錯題循環</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-[#173b4d]">近期學習紀錄</h2></div><Upload className="size-5 text-slate-300" /></div>{!isAuthenticated ? <p className="mt-4 text-sm leading-6 text-slate-500">登入後，這裡會整理你解過的題目、錯誤標籤與變式練習。</p> : history.isLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />正在讀取紀錄…</div> : history.data?.length ? <div className="mt-4 space-y-3">{history.data.slice(0, 4).map(item => { let tags: string[] = []; try { tags = JSON.parse(item.errorTags); } catch { tags = []; } return <div key={item.id} className="rounded-xl border border-slate-100 bg-[#fcfdfc] p-3"><p className="line-clamp-2 text-xs font-medium leading-5 text-slate-700">{item.questionText}</p><div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-slate-400">信心 {item.confidence}%</span><span className="text-[#196b63]">{tags[0] || "已完成"}</span></div></div>; })}<Link href="/review" className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#196b63] hover:text-[#115950]">查看完整錯題本 <ArrowRight className="size-3.5" /></Link></div> : <div className="mt-4 rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">第一筆解題紀錄會出現在這裡。完成後請回看變式練習，建立真正的錯題循環。</div>}</section>
          </aside>
        </section>
      </main>
    </div>
  );
}
