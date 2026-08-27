import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookMarked, CheckCircle2, CircleDashed, Clock3, FileQuestion, Loader2, Sparkles } from "lucide-react";
import { Link } from "wouter";

const STATUS_LABELS = {
  not_attempted: "尚未作答",
  correct: "已完成",
  incorrect: "需要訂正",
  needs_review: "等待回顧",
} as const;

type AttemptRow = { id: string; questionText: string; confidence: number; errorTags: string; needsClarification: boolean };
type PracticeRow = { id: string; sourceAttemptId: string; question: string; studentAnswer: string | null; status: keyof typeof STATUS_LABELS };

export default function Review() {
  const { isAuthenticated, loading } = useAuth();
  const attempts = trpc.tutor.learningLoop.useQuery(undefined, { enabled: isAuthenticated });
  const practices = trpc.tutor.practiceHistory.useQuery(undefined, { enabled: isAuthenticated });
  const attemptRows = (attempts.data ?? []) as AttemptRow[];
  const practiceRows = (practices.data ?? []) as PracticeRow[];

  if (loading) return <Centered><Loader2 className="size-6 animate-spin text-[#196b63]" /></Centered>;
  if (!isAuthenticated) return <Centered><section className="max-w-md rounded-[1.75rem] bg-white p-7 text-center shadow-sm"><Sparkles className="mx-auto size-8 text-[#196b63]" /><h1 className="mt-4 text-xl font-semibold text-[#173b4d]">登入後查看你的錯題本</h1><p className="mt-2 text-sm leading-6 text-slate-500">解題紀錄與變式練習只會保存在你的學習空間中。</p><Link href="/"><Button className="mt-5 rounded-full bg-[#173b4d] hover:bg-[#0f2e3d]">回到解題工作區</Button></Link></section></Centered>;

  return <div className="min-h-screen bg-[#f7f8f5] text-slate-800"><header className="border-b border-white bg-[#f7f8f5]/90 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#173b4d] hover:text-[#196b63]"><ArrowLeft className="size-4" />回到解題工作區</Link><div className="flex items-center gap-2 text-xs text-slate-500"><BookMarked className="size-4 text-[#196b63]" />我的錯題循環</div></div></header><main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.16em] text-[#196b63]">REVIEW & RETRIEVE</p><h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173b4d]">回看錯誤，讓下一題更容易。</h1><p className="mt-3 text-sm leading-6 text-slate-500">這裡保留你的解題紀錄、AI 偵測到的學習標籤，以及已存下的變式練習。重要答案仍應以可驗算步驟與教師意見為準。</p></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#173b4d]">解題紀錄</h2><Clock3 className="size-5 text-[#196b63]" /></div>{attempts.isLoading ? <Loading label="正在整理紀錄…" /> : attemptRows.length ? <div className="mt-5 space-y-3">{attemptRows.map(item => <AttemptCard key={item.id} item={item} />)}</div> : <EmptyState text="還沒有解題紀錄。回到工作區，從一題你正在思考的數學題開始。" />}</section><section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#173b4d]">變式練習</h2><CheckCircle2 className="size-5 text-[#196b63]" /></div>{practices.isLoading ? <Loading label="正在讀取練習…" /> : practiceRows.length ? <div className="mt-5 space-y-3">{practiceRows.map(item => <article key={item.id} className="rounded-2xl bg-[#f8fbfa] p-4 ring-1 ring-[#e2efec]"><p className="text-sm leading-6 text-slate-700">{item.question}</p>{item.studentAnswer && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-slate-500">我的思路：{item.studentAnswer}</p>}<div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-slate-400">來源解題已保存</span><span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#196b63] ring-1 ring-[#dcebe8]">{STATUS_LABELS[item.status]}</span></div></article>)}</div> : <EmptyState text="完成解題後，可把相似題存進來，形成可回顧的練習循環。" />}</section></div></main></div>;
}

function AttemptCard({ item }: { item: AttemptRow }) { let tags: string[] = []; try { tags = JSON.parse(item.errorTags); } catch { /* Invalid historical JSON is shown without tags. */ } return <article className="rounded-2xl bg-[#f8fbfa] p-4 ring-1 ring-[#e2efec]"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium leading-6 text-slate-700">{item.questionText}</p><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#196b63] ring-1 ring-[#dcebe8]">信心 {item.confidence}%</span></div><div className="mt-3 flex flex-wrap gap-1.5">{tags.length ? tags.map(tag => <span key={tag} className="rounded-full bg-[#e5f3f0] px-2 py-1 text-[11px] text-[#196b63]">{tag}</span>) : <span className="text-xs text-slate-400">尚未偵測到錯誤標籤</span>}</div>{item.needsClarification && <p className="mt-3 flex items-center gap-1.5 text-xs text-[#9a5b21]"><FileQuestion className="size-3.5" />這題仍需要補充題目資訊。</p>}</article>; }
function Centered({ children }: { children: React.ReactNode }) { return <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5] p-5">{children}</div>; }
function Loading({ label }: { label: string }) { return <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />{label}</div>; }
function EmptyState({ text }: { text: string }) { return <div className="mt-5 flex min-h-48 flex-col items-center justify-center rounded-2xl bg-[#f7f8f5] px-6 text-center"><CircleDashed className="size-6 text-[#aacbc5]" /><p className="mt-3 text-sm leading-6 text-slate-500">{text}</p></div>; }
