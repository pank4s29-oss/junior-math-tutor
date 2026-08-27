import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CORE_UNITS, GRADE_LABELS, type Grade } from "../../../shared/mathCurriculum";
import { AlertTriangle, ArrowLeft, BadgeCheck, BookOpenCheck, Check, ClipboardCheck, FilePlus2, GraduationCap, Loader2, LogOut, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const CONTENT_TYPES = [
  { value: "concept", label: "核心觀念" },
  { value: "example", label: "示範題" },
  { value: "misconception", label: "常見迷思" },
  { value: "rubric", label: "教學規準" },
] as const;
const DEFAULT_RULES = "先請學生說出已知條件與要求的未知量；引導模式只給下一步提示；完整步驟必須說明等式兩邊為何能同時運算；最後以代入原式驗算。";
const UNIT_KEY_PATTERN = /^[a-z][a-z0-9-]{1,79}$/;
type ContentType = (typeof CONTENT_TYPES)[number]["value"];
type TeacherUnit = { id: string; grade: Grade; unitKey: string; name: string; teachingRules: string; isApproved: boolean; version: number };
type EscalationCase = { id: string; attemptId: string; reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern"; detail: string | null; priority: string; status: "new" | "reviewing" | "resolved" };

export default function TeacherWorkspaceNext() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const canManage = user?.role === "teacher" || user?.role === "admin";
  const [grade, setGrade] = useState<Grade>("seven");
  const [unitKey, setUnitKey] = useState(CORE_UNITS.seven[0].key);
  const [name, setName] = useState(CORE_UNITS.seven[0].label);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [isApproved, setIsApproved] = useState(true);
  const [isNewCustomUnit, setIsNewCustomUnit] = useState(false);
  const [contentUnitId, setContentUnitId] = useState("");
  const [contentType, setContentType] = useState<ContentType>("concept");
  const [contentTitle, setContentTitle] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [contentApproved, setContentApproved] = useState(true);

  const units = trpc.tutor.teacher.listUnits.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const contents = trpc.tutor.teacher.listContents.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const escalations = trpc.tutor.teacher.listEscalations.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const unitRows = (units.data ?? []) as TeacherUnit[];
  const caseRows = (escalations.data ?? []) as EscalationCase[];
  const coreUnits = CORE_UNITS[grade];
  const customUnits = useMemo(
    () => unitRows.filter(unit => unit.grade === grade && !CORE_UNITS[grade].some(core => core.key === unit.unitKey)),
    [grade, unitRows],
  );

  const upsertUnit = trpc.tutor.teacher.upsertUnit.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.createOnly ? "已建立自訂單元。核准後會出現在學生端課程選擇。" : "單元提示規則已儲存並建立版本。", { icon: <Check className="size-4" /> });
      setIsNewCustomUnit(false);
      void units.refetch();
      void contents.refetch();
    },
    onError: error => toast.error(error.message || "單元儲存失敗，請稍後再試。"),
  });
  const addContent = trpc.tutor.teacher.addApprovedContent.useMutation({
    onSuccess: () => { toast.success("教材內容已加入工作台。", { icon: <Check className="size-4" /> }); setContentTitle(""); setContentBody(""); void contents.refetch(); },
    onError: error => toast.error(error.message),
  });
  const updateCase = trpc.tutor.teacher.updateEscalationStatus.useMutation({
    onSuccess: () => { toast.success("案件狀態已更新。"); void escalations.refetch(); },
    onError: error => toast.error(error.message),
  });

  const loadUnit = (nextGrade: Grade, key: string, fallbackName: string) => {
    const stored = unitRows.find(unit => unit.grade === nextGrade && unit.unitKey === key);
    setGrade(nextGrade);
    setUnitKey(key);
    setName(stored?.name ?? fallbackName);
    setRules(stored?.teachingRules ?? DEFAULT_RULES);
    setIsApproved(stored?.isApproved ?? true);
    setIsNewCustomUnit(false);
  };
  const startCustomUnit = () => {
    setUnitKey("");
    setName("");
    setRules(DEFAULT_RULES);
    setIsApproved(false);
    setIsNewCustomUnit(true);
  };
  const saveUnit = () => {
    const normalizedKey = unitKey.trim();
    if (!UNIT_KEY_PATTERN.test(normalizedKey)) return toast.error("單元代碼須以小寫英文字母開頭，且只能使用小寫英文、數字與連字號。");
    if (!name.trim()) return toast.error("請填寫學生會看到的單元名稱。");
    upsertUnit.mutate({ grade, unitKey: normalizedKey, name: name.trim(), teachingRules: rules.trim(), isApproved, createOnly: isNewCustomUnit });
  };
  const handleLogout = async () => {
    try { await logout(); toast.success("已安全登出此裝置。"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "暫時無法登出，請稍後再試。"); }
  };

  if (loading) return <Centered><Loader2 className="size-6 animate-spin text-[#196b63]" /></Centered>;
  if (!isAuthenticated) return <AccessMessage title="登入後開啟教師工作台" detail="工作台只提供給具教師或管理者角色的帳號，用來維護教材、提示規則與學生協助案件。" />;
  if (!canManage) return <AccessMessage title="此頁僅限教師／管理者使用" detail="目前帳號尚未取得教師工作台權限。請由專案管理者在受保護資料庫調整角色。" />;

  return <div className="min-h-screen bg-[#f7f8f5] text-slate-800">
    <header className="sticky top-0 z-20 border-b border-white/80 bg-[#f7f8f5]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#173b4d] hover:text-[#196b63]"><ArrowLeft className="size-4" />回到學生工作區</Link>
        <div className="flex items-center gap-2"><span className="hidden rounded-full bg-[#173b4d] px-3 py-1.5 text-xs font-medium text-white sm:inline"><GraduationCap className="mr-1 inline size-3.5 text-[#f8cf88]" />教師工作台</span><Button type="button" onClick={handleLogout} variant="outline" size="sm" className="rounded-full border-slate-200 bg-white text-xs text-slate-600"><LogOut className="mr-1.5 size-3.5" />登出</Button></div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
      <section className="rounded-[1.8rem] bg-[#173b4d] px-5 py-7 text-white shadow-[0_22px_50px_-34px_rgba(23,59,77,0.7)] sm:px-7"><p className="text-xs font-semibold tracking-[0.16em] text-[#f8cf88]">TEACHING CONTROL LAYER</p><h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">把你的教學方法放進每一題。</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">可建立自訂單元、教材與規則；學生端只會看見並使用已核准的內容。</p></section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={<SlidersHorizontal />} eyebrow="提示規則" title={isNewCustomUnit ? "新增自訂解題單元" : "單元教學規則"} detail={isNewCustomUnit ? "草稿不會顯示給學生；勾選核准後才會出現在學生端課程選擇。" : "每次儲存都會建立新版本；只有已核准規則會進入學生解題流程。"} />
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{(["seven", "eight", "nine"] as Grade[]).map(item => <button type="button" key={item} onClick={() => loadUnit(item, CORE_UNITS[item][0].key, CORE_UNITS[item][0].label)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${grade === item ? "bg-[#196b63] text-white" : "bg-[#f2f5f4] text-slate-600"}`}>{GRADE_LABELS[item]}</button>)}</div>
            <p className="mt-4 text-xs font-semibold text-slate-500">核心課綱</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{coreUnits.map(item => <button type="button" key={item.key} onClick={() => loadUnit(grade, item.key, item.label)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${!isNewCustomUnit && unitKey === item.key ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>{item.label}</button>)}</div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-slate-500">自訂單元</p>{customUnits.map(item => <button type="button" key={item.id} onClick={() => loadUnit(grade, item.unitKey, item.name)} className={`rounded-xl border px-3 py-2 text-xs font-medium ${!isNewCustomUnit && unitKey === item.unitKey ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>{item.name}</button>)}<button type="button" onClick={startCustomUnit} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-[#83c0b6] bg-[#f7fcfa] px-3 py-2 text-xs font-semibold text-[#196b63]"><Plus className="size-3.5" />新增自訂單元</button></div>
            <div className="mt-5 grid gap-4">
              {isNewCustomUnit && <label className="grid gap-1.5 text-sm font-medium text-slate-700">單元代碼<Input value={unitKey} onChange={event => setUnitKey(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="例如 probability-tree" maxLength={80} autoCapitalize="none" spellCheck={false} /><span className="text-xs font-normal leading-5 text-slate-500">系統辨識用，建立後不能更名；請用小寫英文、數字與連字號。</span></label>}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">學生顯示的單元名稱<Input value={name} onChange={event => setName(event.target.value)} placeholder="例如 樹狀圖與條件機率" maxLength={160} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">教師提示規則<Textarea value={rules} onChange={event => setRules(event.target.value)} className="min-h-44 leading-6" maxLength={5000} /></label>
              <CheckLabel checked={isApproved} onChange={setIsApproved} label="核准此單元，讓學生在課程選擇與解題時使用" />
              <Button type="button" onClick={saveUnit} disabled={upsertUnit.isPending || rules.trim().length < 30 || !name.trim() || (isNewCustomUnit && !UNIT_KEY_PATTERN.test(unitKey.trim()))} className="w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]"><Save className="mr-2 size-4" />{upsertUnit.isPending ? "正在儲存…" : isNewCustomUnit ? "建立自訂單元" : "儲存規則版本"}</Button>
            </div>
          </section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle icon={<FilePlus2 />} eyebrow="教材內容" title="新增核准教材" detail="加入觀念、示範題、迷思或規準。解題模型僅會使用已核准內容。" /><div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-medium text-slate-700">歸屬單元<select value={contentUnitId} onChange={event => setContentUnitId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"><option value="">選擇已建立的單元規則</option>{unitRows.map(item => <option key={item.id} value={item.id}>{GRADE_LABELS[item.grade]}・{item.name}（v{item.version}）</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">內容類型<select value={contentType} onChange={event => setContentType(event.target.value as ContentType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm">{CONTENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">標題<Input value={contentTitle} onChange={event => setContentTitle(event.target.value)} maxLength={200} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">內容<Textarea value={contentBody} onChange={event => setContentBody(event.target.value)} className="min-h-36 leading-6" maxLength={12000} /></label><CheckLabel checked={contentApproved} onChange={setContentApproved} label="核准此內容供學生解題時參考" /><Button type="button" onClick={() => { if (!contentUnitId) return toast.error("請先儲存一個單元規則。"); addContent.mutate({ unitId: contentUnitId, type: contentType, title: contentTitle, body: contentBody, isApproved: contentApproved }); }} disabled={addContent.isPending || !contentTitle.trim() || contentBody.trim().length < 20} className="w-full rounded-xl bg-[#196b63] hover:bg-[#115950]"><BookOpenCheck className="mr-2 size-4" />{addContent.isPending ? "正在加入…" : "加入教材內容"}</Button></div></section>
        </div>
        <div className="space-y-6">
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">核准資料庫</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">教材與規則狀態</h2></div><BadgeCheck className="size-6 text-[#196b63]" /></div><div className="mt-5 space-y-3">{units.isLoading || contents.isLoading ? <Loading label="讀取中…" /> : <><div className="rounded-2xl bg-[#f7f8f5] p-4"><p className="text-xs text-slate-500">已建立單元規則</p><p className="mt-1 text-2xl font-semibold text-[#173b4d]">{unitRows.length}<span className="ml-1 text-sm font-normal text-slate-400">個</span></p></div>{unitRows.slice(0, 5).map(item => <article key={item.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-700">{GRADE_LABELS[item.grade]}・{item.name}</p><p className="mt-1 text-xs text-slate-400">代碼 {item.unitKey}・版本 v{item.version}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${item.isApproved ? "bg-[#e5f3f0] text-[#196b63]" : "bg-[#fff3e6] text-[#9a5b21]"}`}>{item.isApproved ? "已核准" : "草稿"}</span></div></article>)}{!unitRows.length && <p className="rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">請先建立至少一個單元規則，才能加入對應教材。</p>}<div className="border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">已加入教材內容</p><p className="mt-1 text-lg font-semibold text-[#173b4d]">{contents.data?.length || 0} <span className="text-xs font-normal text-slate-400">筆</span></p></div></>}</div></section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#9a5b21]">品質檢查</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">學生回報案件</h2><p className="mt-1 text-xs leading-5 text-slate-500">案件從 Supabase 讀取，更新會直接寫回案件狀態。</p></div><AlertTriangle className="mt-1 size-5 text-[#c77948]" /></div><div className="mt-5 space-y-3">{escalations.isLoading ? <Loading label="讀取案件…" /> : caseRows.length ? caseRows.map(item => <article key={item.id} className="rounded-2xl border border-[#f0e0c5] bg-[#fffdfa] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-700">學生案件・{reasonLabel(item.reason)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail || "學生未提供額外說明。"}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${item.priority === "high" ? "bg-[#f7ddd5] text-[#9a4331]" : "bg-[#f8edd6] text-[#9a5b21]"}`}>{item.priority === "high" ? "優先" : "一般"}</span></div><div className="mt-3 flex flex-wrap gap-2">{(["new", "reviewing", "resolved"] as const).map(status => <button type="button" key={status} disabled={updateCase.isPending} onClick={() => updateCase.mutate({ id: item.id, status })} className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === status ? "bg-[#173b4d] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{status === "new" ? "待處理" : status === "reviewing" ? "檢查中" : "已結案"}</button>)}</div></article>) : <div className="rounded-2xl bg-[#f7f8f5] p-4 text-sm leading-6 text-slate-500"><ClipboardCheck className="mb-2 size-5 text-[#a5cfc8]" />目前沒有學生回報案件。</div>}</div></section>
        </div>
      </div>
    </main>
  </div>;
}

function SectionTitle({ icon, eyebrow, title, detail }: { icon: React.ReactNode; eyebrow: string; title: string; detail: string }) { return <div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-2xl bg-[#e5f3f0] text-[#196b63]">{icon}</div><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>; }
function CheckLabel({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="flex items-center gap-2 rounded-xl bg-[#f7f8f5] px-3 py-2.5 text-sm text-slate-600"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="size-4 accent-[#196b63]" />{label}</label>; }
function Centered({ children }: { children: React.ReactNode }) { return <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5]">{children}</div>; }
function AccessMessage({ title, detail }: { title: string; detail: string }) { return <Centered><section className="max-w-md rounded-[1.75rem] bg-white p-7 text-center shadow-sm"><GraduationCap className="mx-auto size-8 text-[#196b63]" /><h1 className="mt-4 text-xl font-semibold text-[#173b4d]">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p><Link href="/"><Button className="mt-5 rounded-full bg-[#173b4d] hover:bg-[#0f2e3d]">回到解題工作區</Button></Link></section></Centered>; }
function Loading({ label }: { label: string }) { return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />{label}</p>; }
function reasonLabel(reason: EscalationCase["reason"]) { return reason === "teacher_help" ? "教師協助" : reason === "wrong_answer" ? "答案疑慮" : reason === "unclear_photo" ? "照片不清楚" : "安全疑慮"; }
