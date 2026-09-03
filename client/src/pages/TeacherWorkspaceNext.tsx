import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CORE_UNITS, GRADE_LABELS, PRACTICE_DIFFICULTY_LABELS, type Grade } from "../../../shared/mathCurriculum";
import { AlertTriangle, ArrowLeft, BadgeCheck, BookOpenCheck, Check, ClipboardCheck, Database, FilePlus2, FileUp, GraduationCap, Layers3, Loader2, LogOut, Plus, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
type TeacherMode = { id: string; modeKey: string; name: string; description: string; teachingInstructions: string; isApproved: boolean; version: number };
type TeacherMaterial = { id: string; title: string; originalName: string; mimeType: string; byteSize: number; extractedText: string; isApproved: boolean; version: number; unitName: string; grade: Grade | null };
type EscalationCase = { id: string; attemptId: string; reason: "wrong_answer" | "unclear_photo" | "teacher_help" | "safety_concern"; detail: string | null; priority: string; status: "new" | "reviewing" | "resolved" };
type BankStatRow = { grade: Grade; unitKey: string; difficulty: "intro" | "standard" | "challenge"; availableCount: number };
const BANK_TARGET_POOL_SIZE = 6; // 需與 server/tutor/practiceQuestionBank.ts 的 BANK_TARGET_POOL_SIZE 一致，僅用於前端顯示提示，不影響實際補題邏輯。

function readFileAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("教材檔案讀取失敗。")); reader.onerror = () => reject(new Error("教材檔案讀取失敗。")); reader.readAsDataURL(file); }); }
function materialType(file: File) { if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "application/pdf" as const; if (file.type === "text/markdown" || /\.md$/i.test(file.name)) return "text/markdown" as const; return "text/plain" as const; }

export default function TeacherWorkspaceNext() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const canManage = user?.role === "teacher" || user?.role === "admin";
  const [grade, setGrade] = useState<Grade>("seven");
  const [unitKey, setUnitKey] = useState(CORE_UNITS.seven[0].key);
  const [name, setName] = useState(CORE_UNITS.seven[0].label);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [isApproved, setIsApproved] = useState(true);
  const [isNewCustomUnit, setIsNewCustomUnit] = useState(false);
  const [contentUnitValue, setContentUnitValue] = useState("seven:integer-number-line");
  const [contentType, setContentType] = useState<ContentType>("concept");
  const [contentTitle, setContentTitle] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [contentApproved, setContentApproved] = useState(true);
  const [modeKey, setModeKey] = useState("guided");
  const [modeName, setModeName] = useState("引導解題");
  const [modeDescription, setModeDescription] = useState("先給下一步提示，不急著揭露答案。");
  const [modeInstructions, setModeInstructions] = useState("先給一個最小但有用的提示。除非學生明確要求完整解法，否則只揭露能讓他做下一步的內容；仍須保留固定欄位，但步驟欄最多列出下一步與其理由。");
  const [modeApproved, setModeApproved] = useState(true);
  const [isNewMode, setIsNewMode] = useState(false);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [materialApproved, setMaterialApproved] = useState(true);
  const [batchLimit, setBatchLimit] = useState<5 | 10>(5);

  const units = trpc.tutor.teacher.listUnits.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const contents = trpc.tutor.teacher.listContents.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const modes = trpc.tutor.teacher.listModes.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const materials = trpc.tutor.teacher.listMaterials.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const batchSettings = trpc.tutor.batchSettings.useQuery(undefined, { enabled: isAuthenticated && canManage, retry: false });
  const escalations = trpc.tutor.teacher.listEscalations.useQuery(undefined, { enabled: isAuthenticated && canManage });
  const bankStats = trpc.tutor.teacher.listPracticeQuestionBankStats.useQuery(undefined, {
    enabled: isAuthenticated && canManage,
    // 這支查詢失敗幾乎都是「題庫的資料表／view 還沒在 Supabase 上建立」（migration 尚未套用）
    // 這種非暫時性錯誤，重試 3 次也不會變成功，只會讓主控台多噴 3 次一樣的 500 錯誤、
    // 也讓某些瀏覽器擴充功能／效能監測腳本在短時間內處理大量失敗的 resource timing
    // 而額外出錯。跟 batchSettings 一樣關掉重試，失敗就直接顯示錯誤，不要白白重試。
    retry: false,
  });
  const unitRows = (units.data ?? []) as TeacherUnit[];
  const caseRows = (escalations.data ?? []) as EscalationCase[];
  const modeRows = (modes.data ?? []) as TeacherMode[];
  const materialRows = (materials.data ?? []) as TeacherMaterial[];
  const coreUnits = CORE_UNITS[grade];
  const customUnits = useMemo(
    () => unitRows.filter(unit => unit.grade === grade && !CORE_UNITS[grade].some(core => core.key === unit.unitKey)),
    [grade, unitRows],
  );
  const contentUnitOptions = useMemo(() => (["seven", "eight", "nine"] as Grade[]).flatMap(optionGrade => {
    const current = new Map(unitRows.filter(item => item.grade === optionGrade).map(item => [item.unitKey, item]));
    const core = CORE_UNITS[optionGrade].map(item => ({ grade: optionGrade, unitKey: item.key, name: current.get(item.key)?.name ?? item.label, hasRules: current.has(item.key) }));
    const custom = unitRows.filter(item => item.grade === optionGrade && !CORE_UNITS[optionGrade].some(coreItem => coreItem.key === item.unitKey)).map(item => ({ grade: optionGrade, unitKey: item.unitKey, name: item.name, hasRules: true }));
    return [...core, ...custom];
  }), [unitRows]);
  const selectedContentUnit = contentUnitOptions.find(item => `${item.grade}:${item.unitKey}` === contentUnitValue) ?? contentUnitOptions[0];

  useEffect(() => { setContentUnitValue(`${grade}:${unitKey}`); }, [grade, unitKey]);
  useEffect(() => { if (batchSettings.data?.maxBatchQuestions === 10) setBatchLimit(10); }, [batchSettings.data?.maxBatchQuestions]);

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
    onSuccess: () => { toast.success("教材內容已加入指定單元。", { icon: <Check className="size-4" /> }); setContentTitle(""); setContentBody(""); void units.refetch(); void contents.refetch(); },
    onError: error => toast.error(error.message),
  });
  const upsertMode = trpc.tutor.teacher.upsertMode.useMutation({
    onSuccess: (_, variables) => { toast.success(variables.createOnly ? "已建立解題模式草稿；核准後學生即可選擇。" : "解題模式已儲存並建立版本。"); setIsNewMode(false); void modes.refetch(); },
    onError: error => toast.error(error.message || "解題模式儲存失敗，請稍後再試。"),
  });
  const updateBatchLimit = trpc.tutor.teacher.updateBatchLimit.useMutation({
    onSuccess: value => { setBatchLimit(value as 5 | 10); toast.success(`學生每批最多 ${value} 題，已更新。`); void batchSettings.refetch(); },
    onError: error => toast.error(error.message || "批次上限更新失敗。"),
  });
  const uploadMaterial = trpc.tutor.teacher.uploadMaterial.useMutation({
    onSuccess: () => { void materials.refetch(); void contents.refetch(); },
    onError: error => toast.error(error.message || "教材檔案匯入失敗。"),
  });
  const updateCase = trpc.tutor.teacher.updateEscalationStatus.useMutation({
    onSuccess: () => { toast.success("案件狀態已更新。"); void escalations.refetch(); },
    onError: error => toast.error(error.message),
  });
  const refillBank = trpc.tutor.teacher.refillPracticeQuestionBank.useMutation({
    onSuccess: summary => {
      toast.success(summary.questionsGenerated > 0
        ? `已補入 ${summary.questionsGenerated} 題；${summary.combinationsBelowTarget} 個組合原本庫存不足。`
        : "本次執行沒有補入新題目（可能題庫已滿，或本次全部失敗，請查看伺服器 log）。");
      void bankStats.refetch();
    },
    onError: error => toast.error(error.message || "手動補題失敗，請稍後再試。"),
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
  const loadMode = (item: TeacherMode) => { setModeKey(item.modeKey); setModeName(item.name); setModeDescription(item.description); setModeInstructions(item.teachingInstructions); setModeApproved(item.isApproved); setIsNewMode(false); };
  const startNewMode = () => { setModeKey(""); setModeName(""); setModeDescription(""); setModeInstructions("請以繁體中文引導學生，優先確認題意、說明關鍵觀念、呈現可追蹤的推理，最後進行驗算。不得跳過固定結構化回覆與安全規則。"); setModeApproved(false); setIsNewMode(true); };
  const saveMode = () => {
    const key = modeKey.trim();
    if (!UNIT_KEY_PATTERN.test(key)) return toast.error("模式代碼須以小寫英文字母開頭，且只能使用小寫英文、數字與連字號。");
    if (!modeName.trim() || !modeDescription.trim()) return toast.error("請填寫學生會看到的模式名稱與說明。");
    upsertMode.mutate({ modeKey: key, name: modeName.trim(), description: modeDescription.trim(), teachingInstructions: modeInstructions.trim(), isApproved: modeApproved, createOnly: isNewMode });
  };
  const importMaterials = async () => {
    if (!selectedContentUnit) return toast.error("請先選擇教材歸屬單元。");
    if (!materialFiles.length) return toast.error("請至少選擇一個教材檔案。");
    try {
      for (const file of materialFiles) {
        if (!/\.(pdf|txt|md)$/i.test(file.name) && !["application/pdf", "text/plain", "text/markdown"].includes(file.type)) throw new Error(`${file.name} 不是可匯入的 PDF、TXT 或 Markdown 教材。`);
        if (file.size === 0 || file.size > 3 * 1024 * 1024) throw new Error(`${file.name} 超過 3MB 或是空檔案。`);
        await uploadMaterial.mutateAsync({ grade: selectedContentUnit.grade, unitKey: selectedContentUnit.unitKey, unitName: selectedContentUnit.name, title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "匯入教材", filename: file.name, mimeType: materialType(file), dataUrl: await readFileAsDataUrl(file), isApproved: materialApproved });
      }
      toast.success(`已匯入 ${materialFiles.length} 份教材；僅核准檔案的教學文字會用於學生解題。`);
      setMaterialFiles([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "教材檔案匯入失敗。");
    }
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
            <SectionTitle icon={<SlidersHorizontal />} eyebrow="解題工作階段" title="每批多題上限" detail="設定學生一次上傳可建立的題目數；設定只影響新工作階段，不會中斷正在處理的題目。" />
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{([5, 10] as const).map(value => <button type="button" key={value} onClick={() => setBatchLimit(value)} className={`shrink-0 rounded-xl border px-4 py-3 text-sm font-semibold ${batchLimit === value ? "border-[#196b63] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>每批 {value} 題</button>)}<Button type="button" onClick={() => updateBatchLimit.mutate({ maxBatchQuestions: batchLimit })} disabled={updateBatchLimit.isPending} className="ml-auto shrink-0 rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]">{updateBatchLimit.isPending ? "儲存中…" : "儲存上限"}</Button></div>
          </section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={<SlidersHorizontal />} eyebrow="提示規則" title={isNewCustomUnit ? "新增自訂解題單元" : "單元教學規則"} detail={isNewCustomUnit ? "草稿不會顯示給學生；勾選核准後才會出現在學生端課程選擇。" : "每次儲存都會建立新版本；只有已核准規則會進入學生解題流程。"} />
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{(["seven", "eight", "nine"] as Grade[]).map(item => <button type="button" key={item} onClick={() => loadUnit(item, CORE_UNITS[item][0].key, CORE_UNITS[item][0].label)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${grade === item ? "bg-[#196b63] text-white" : "bg-[#f2f5f4] text-slate-600"}`}>{GRADE_LABELS[item]}</button>)}</div>
            <p className="mt-4 text-xs font-semibold text-slate-500">核心課綱</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{coreUnits.map(item => <button type="button" key={item.key} onClick={() => loadUnit(grade, item.key, item.label)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${!isNewCustomUnit && unitKey === item.key ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>{item.label}</button>)}</div>
            <p className="mt-4 text-xs font-semibold text-slate-500">自訂單元</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{customUnits.map(item => <button type="button" key={item.id} onClick={() => loadUnit(grade, item.unitKey, item.name)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${!isNewCustomUnit && unitKey === item.unitKey ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>{item.name}</button>)}<button type="button" onClick={startCustomUnit} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-[#83c0b6] bg-[#f7fcfa] px-3 py-2 text-xs font-semibold text-[#196b63]"><Plus className="size-3.5" />新增自訂單元</button></div>
            <div className="mt-5 grid gap-4">
              {isNewCustomUnit && <label className="grid gap-1.5 text-sm font-medium text-slate-700">單元代碼<Input value={unitKey} onChange={event => setUnitKey(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="例如 probability-tree" maxLength={80} autoCapitalize="none" spellCheck={false} /><span className="text-xs font-normal leading-5 text-slate-500">系統辨識用，建立後不能更名；請用小寫英文、數字與連字號。</span></label>}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">學生顯示的單元名稱<Input value={name} onChange={event => setName(event.target.value)} placeholder="例如 樹狀圖與條件機率" maxLength={160} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">教師提示規則<Textarea value={rules} onChange={event => setRules(event.target.value)} className="min-h-44 leading-6" maxLength={5000} /></label>
              <CheckLabel checked={isApproved} onChange={setIsApproved} label="核准此單元，讓學生在課程選擇與解題時使用" />
              <Button type="button" onClick={saveUnit} disabled={upsertUnit.isPending || rules.trim().length < 30 || !name.trim() || (isNewCustomUnit && !UNIT_KEY_PATTERN.test(unitKey.trim()))} className="w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]"><Save className="mr-2 size-4" />{upsertUnit.isPending ? "正在儲存…" : isNewCustomUnit ? "建立自訂單元" : "儲存規則版本"}</Button>
            </div>
          </section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={<Layers3 />} eyebrow="解題流程" title={isNewMode ? "新增解題模式" : "學生可選解題模式"} detail="可調整既有流程，或新增草稿流程；只有已核准模式會顯示在學生端，固定安全規則與結構化回覆仍會保留。" />
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{modeRows.map(item => <button type="button" key={item.id} onClick={() => loadMode(item)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${!isNewMode && modeKey === item.modeKey ? "border-[#9acfc6] bg-[#eaf6f3] text-[#125d55]" : "border-slate-200 text-slate-500"}`}>{item.name}</button>)}<button type="button" onClick={startNewMode} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-[#83c0b6] bg-[#f7fcfa] px-3 py-2 text-xs font-semibold text-[#196b63]"><Plus className="size-3.5" />新增模式</button></div>
            <div className="mt-5 grid gap-4">{isNewMode && <label className="grid gap-1.5 text-sm font-medium text-slate-700">模式代碼<Input value={modeKey} onChange={event => setModeKey(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="例如 exam-review" maxLength={80} autoCapitalize="none" spellCheck={false} /><span className="text-xs font-normal text-slate-500">建立後不可更名；請用小寫英文、數字與連字號。</span></label>}<label className="grid gap-1.5 text-sm font-medium text-slate-700">學生顯示名稱<Input value={modeName} onChange={event => setModeName(event.target.value)} placeholder="例如 考前重點複習" maxLength={80} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">學生端說明<Textarea value={modeDescription} onChange={event => setModeDescription(event.target.value)} rows={2} maxLength={240} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">教學流程指令<Textarea value={modeInstructions} onChange={event => setModeInstructions(event.target.value)} className="min-h-32 leading-6" maxLength={3000} /><span className="text-xs font-normal text-slate-500">用來描述提示、步驟與訂正節奏；系統仍會強制保留可靠性、隱私與固定回覆欄位。</span></label><CheckLabel checked={modeApproved} onChange={setModeApproved} label="核准此模式，讓學生選擇" /><Button type="button" onClick={saveMode} disabled={upsertMode.isPending || !modeName.trim() || !modeDescription.trim() || modeInstructions.trim().length < 30 || (isNewMode && !UNIT_KEY_PATTERN.test(modeKey.trim()))} className="w-full rounded-xl bg-[#173b4d] hover:bg-[#0f2e3d]"><Save className="mr-2 size-4" />{upsertMode.isPending ? "正在儲存…" : isNewMode ? "建立解題模式" : "儲存模式版本"}</Button></div>
          </section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={<FileUp />} eyebrow="教材檔案" title="依單元批次匯入教材" detail="支援 PDF、TXT、Markdown；每檔上限 3MB。檔案保存在私有教材庫，PDF 會由伺服器擷取教學文字，僅核准文字會進入學生解題參考。" />
            <div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-medium text-slate-700">歸屬單元<select value={contentUnitValue} onChange={event => setContentUnitValue(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm">{(["seven", "eight", "nine"] as Grade[]).map(optionGrade => <optgroup key={optionGrade} label={GRADE_LABELS[optionGrade]}>{contentUnitOptions.filter(item => item.grade === optionGrade).map(item => <option key={`${item.grade}:${item.unitKey}`} value={`${item.grade}:${item.unitKey}`}>{item.name}</option>)}</optgroup>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-700"><span>教材檔案</span><Input type="file" multiple accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={event => setMaterialFiles(Array.from(event.target.files ?? []))} /><span className="text-xs font-normal text-slate-500">可一次選取多份同一單元的教材。請不要匯入含學生個資、帳密或 API 金鑰的文件。</span></label>{materialFiles.length > 0 && <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl bg-[#f7f8f5] p-3 text-xs text-slate-600">{materialFiles.map(file => <p key={`${file.name}-${file.lastModified}`} className="truncate">{file.name}・{Math.ceil(file.size / 1024)} KB</p>)}</div>}<CheckLabel checked={materialApproved} onChange={setMaterialApproved} label="核准這批教材供對應單元的學生解題時參考" /><Button type="button" onClick={importMaterials} disabled={uploadMaterial.isPending || !selectedContentUnit || !materialFiles.length} className="w-full rounded-xl bg-[#196b63] hover:bg-[#115950]"><FileUp className="mr-2 size-4" />{uploadMaterial.isPending ? "正在匯入教材…" : `匯入 ${materialFiles.length || "多份"} 教材`}</Button>{materialRows.length > 0 && <p className="text-xs leading-5 text-slate-500">教材庫目前有 {materialRows.length} 份檔案；最新一份為「{materialRows[0].title}」。</p>}</div>
          </section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle icon={<FilePlus2 />} eyebrow="教材內容" title="新增核准教材" detail="先選年級與指定單元，再加入觀念、示範題、迷思或規準；學生解題只會使用已核准內容。" /><div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-medium text-slate-700">歸屬單元<select value={contentUnitValue} onChange={event => setContentUnitValue(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm">{(["seven", "eight", "nine"] as Grade[]).map(optionGrade => <optgroup key={optionGrade} label={GRADE_LABELS[optionGrade]}>{contentUnitOptions.filter(item => item.grade === optionGrade).map(item => <option key={`${item.grade}:${item.unitKey}`} value={`${item.grade}:${item.unitKey}`}>{item.name}{item.hasRules ? "" : "（首次加入會建立單元規則）"}</option>)}</optgroup>)}</select><span className="text-xs font-normal leading-5 text-slate-500">目前指定：{selectedContentUnit ? `${GRADE_LABELS[selectedContentUnit.grade]}・${selectedContentUnit.name}` : "請選擇單元"}。切換上方單元時會自動帶入此處。</span></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">內容類型<select value={contentType} onChange={event => setContentType(event.target.value as ContentType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm">{CONTENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">標題<Input value={contentTitle} onChange={event => setContentTitle(event.target.value)} maxLength={200} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">內容<Textarea value={contentBody} onChange={event => setContentBody(event.target.value)} className="min-h-36 leading-6" maxLength={12000} /></label><CheckLabel checked={contentApproved} onChange={setContentApproved} label="核准此內容供學生解題時參考" /><Button type="button" onClick={() => { if (!selectedContentUnit) return toast.error("請先選擇教材歸屬單元。"); addContent.mutate({ grade: selectedContentUnit.grade, unitKey: selectedContentUnit.unitKey, unitName: selectedContentUnit.name, type: contentType, title: contentTitle, body: contentBody, isApproved: contentApproved }); }} disabled={addContent.isPending || !selectedContentUnit || !contentTitle.trim() || contentBody.trim().length < 20} className="w-full rounded-xl bg-[#196b63] hover:bg-[#115950]"><BookOpenCheck className="mr-2 size-4" />{addContent.isPending ? "正在加入…" : "加入指定單元教材"}</Button></div></section>
        </div>
        <div className="space-y-6">
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">核准資料庫</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">教材與規則狀態</h2></div><BadgeCheck className="size-6 text-[#196b63]" /></div><div className="mt-5 space-y-3">{units.isLoading || contents.isLoading ? <Loading label="讀取中…" /> : <><div className="rounded-2xl bg-[#f7f8f5] p-4"><p className="text-xs text-slate-500">已建立單元規則</p><p className="mt-1 text-2xl font-semibold text-[#173b4d]">{unitRows.length}<span className="ml-1 text-sm font-normal text-slate-400">個</span></p></div>{unitRows.slice(0, 5).map(item => <article key={item.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-700">{GRADE_LABELS[item.grade]}・{item.name}</p><p className="mt-1 text-xs text-slate-400">代碼 {item.unitKey}・版本 v{item.version}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${item.isApproved ? "bg-[#e5f3f0] text-[#196b63]" : "bg-[#fff3e6] text-[#9a5b21]"}`}>{item.isApproved ? "已核准" : "草稿"}</span></div></article>)}{!unitRows.length && <p className="rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">請先建立至少一個單元規則，才能加入對應教材。</p>}<div className="border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">已加入教材內容</p><p className="mt-1 text-lg font-semibold text-[#173b4d]">{contents.data?.length || 0} <span className="text-xs font-normal text-slate-400">筆</span></p></div></>}</div></section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#9a5b21]">品質檢查</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">學生回報案件</h2><p className="mt-1 text-xs leading-5 text-slate-500">案件從 Supabase 讀取，更新會直接寫回案件狀態。</p></div><AlertTriangle className="mt-1 size-5 text-[#c77948]" /></div><div className="mt-5 space-y-3">{escalations.isLoading ? <Loading label="讀取案件…" /> : caseRows.length ? caseRows.map(item => <article key={item.id} className="rounded-2xl border border-[#f0e0c5] bg-[#fffdfa] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-700">學生案件・{reasonLabel(item.reason)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail || "學生未提供額外說明。"}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${item.priority === "high" ? "bg-[#f7ddd5] text-[#9a4331]" : "bg-[#f8edd6] text-[#9a5b21]"}`}>{item.priority === "high" ? "優先" : "一般"}</span></div><div className="mt-3 flex flex-wrap gap-2">{(["new", "reviewing", "resolved"] as const).map(status => <button type="button" key={status} disabled={updateCase.isPending} onClick={() => updateCase.mutate({ id: item.id, status })} className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === status ? "bg-[#173b4d] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{status === "new" ? "待處理" : status === "reviewing" ? "檢查中" : "已結案"}</button>)}</div></article>) : <div className="rounded-2xl bg-[#f7f8f5] p-4 text-sm leading-6 text-slate-500"><ClipboardCheck className="mb-2 size-5 text-[#a5cfc8]" />目前沒有學生回報案件。</div>}</div></section>
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">背景補題排程</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#173b4d]">練習題庫存量</h2><p className="mt-1 text-xs leading-5 text-slate-500">學生出題會優先從這裡秒回，庫存不足時才即時呼叫 Gemini。正式環境依 Vercel cron／GitHub Actions 排程自動補題，這裡的按鈕僅供立即手動補題（例如上線前預熱）。</p></div><Database className="mt-1 size-5 text-[#196b63]" /></div>
            <div className="mt-5 space-y-3">
              {bankStats.isLoading ? <Loading label="讀取題庫庫存…" /> : bankStats.data?.length ? (() => {
                const rows = (bankStats.data ?? []) as BankStatRow[];
                const lowStock = [...rows].sort((a, b) => a.availableCount - b.availableCount).slice(0, 6);
                const emptyCount = rows.filter(item => item.availableCount === 0).length;
                return <>
                  <div className="rounded-2xl bg-[#f7f8f5] p-4"><p className="text-xs text-slate-500">目前題庫完全掏空的組合</p><p className="mt-1 text-2xl font-semibold text-[#173b4d]">{emptyCount}<span className="ml-1 text-sm font-normal text-slate-400">個（這些組合下次出題會直接即時呼叫 Gemini）</span></p></div>
                  <div className="space-y-2">{lowStock.map(item => <div key={`${item.grade}:${item.unitKey}:${item.difficulty}`} className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5 text-xs"><span className="text-slate-600">{GRADE_LABELS[item.grade]}・{CORE_UNITS[item.grade].find(unit => unit.key === item.unitKey)?.label ?? item.unitKey}・{PRACTICE_DIFFICULTY_LABELS[item.difficulty]}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${item.availableCount === 0 ? "bg-[#f7ddd5] text-[#9a4331]" : item.availableCount < BANK_TARGET_POOL_SIZE ? "bg-[#fff3e6] text-[#9a5b21]" : "bg-[#e5f3f0] text-[#196b63]"}`}>{item.availableCount} 題</span></div>)}</div>
                </>;
              })() : <p className="rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">題庫目前是空的（全新環境或尚未執行過補題排程）；學生出題會自動退回即時生成，不會出錯，但體感會較慢。</p>}
              <Button type="button" onClick={() => refillBank.mutate()} disabled={refillBank.isPending} variant="outline" className="w-full rounded-xl border-[#a7d4cd] text-[#196b63]"><RefreshCw className={`mr-2 size-4 ${refillBank.isPending ? "animate-spin" : ""}`} />{refillBank.isPending ? "正在補題（可能需要數十秒）…" : "立即手動補題一次"}</Button>
            </div>
          </section>
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
