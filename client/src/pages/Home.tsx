import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message, type PhotoQuality } from "@/components/AIChatBox";
import { AttachmentHistoryPanel, type AttachmentHistoryItem } from "@/components/AttachmentHistoryPanel";
import { AuthDialogNext } from "@/components/AuthDialogNext";
import { ExportFormatMenu } from "@/components/ExportFormatMenu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadBase64File } from "@/lib/downloadBase64File";
import { trpc } from "@/lib/trpc";
import { CORE_UNITS, DEFAULT_TUTOR_MODES, GRADE_LABELS, type Grade, type TutorMode } from "../../../shared/mathCurriculum";
import { AlertCircle, ArrowRight, BadgeCheck, BookOpenCheck, CheckCircle2, CircleHelp, Clock3, FileWarning, GraduationCap, Lightbulb, Loader2, LogOut, NotebookPen, ShieldCheck, Sparkles, Tag, Upload, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

// conversationId 不再需要由前端保存：伺服器會在附件第一次成功解題後，自動把 conversation
// 與該 attachmentId 綁定；之後只要帶著同一個 attachmentId 追問，就能自動延續正確的對話。
type PendingAttachment = { localId: string; file: File; kind: "image" | "pdf" | "text"; preview?: string; normalizedDataUrl?: string; quality: PhotoQuality; attachmentId?: string; transcription?: string };
type LastAttempt = { id: string | null; variationQuestion: string; confidence: number; needsClarification: boolean };
type LearningAttempt = { id: string; questionText: string; confidence: number; errorTags: string; needsClarification: boolean };
type StudentMode = { key: string; name: string; description: string };

function modeIcon(modeKey: string) { return modeKey === "guided" ? Lightbulb : modeKey === "check" ? CheckCircle2 : BookOpenCheck; }
function suggestedPromptsForUnit(grade: Grade, unitKey: string, unitLabel: string) {
  const examples: Record<string, string[]> = {
    "integer-number-line": ["比較 −8 與 3 的大小，先提示我怎麼看數線", "我不懂負數相加，請用一題例子引導我"],
    "linear-equations": ["解 3x − 7 = 11，先給我下一步提示", "我解 2(x+3)=16 得到 x=5，請檢查第一個錯誤"],
    polynomials: ["展開 (x+3)(x−2)，請逐步說明", "我不懂完全平方公式怎麼使用"],
    "roots-pythagorean": ["直角三角形兩股為 6、8，請引導我求斜邊", "請檢查我化簡 √72 的過程"],
    probability: ["擲兩顆骰子和為 7 的機率怎麼算？先提示", "用樹狀圖解釋兩次抽球的機率"],
  };
  return examples[unitKey] ?? [`我正在學「${unitLabel}」，請先給我一題入門提示`, `請用「${unitLabel}」幫我檢查這個解題步驟`];
}

function prepareHandwrittenPhoto(file: File) {
  return new Promise<Pick<PendingAttachment, "preview" | "normalizedDataUrl" | "quality">>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 1800 / longest);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error("此裝置暫時無法處理題目照片。")); return; }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.filter = "contrast(1.16) brightness(1.04)";
      context.drawImage(image, 0, 0, width, height);
      context.filter = "none";
      const sample = context.getImageData(0, 0, Math.min(width, 96), Math.min(height, 96)).data;
      let total = 0;
      let totalSquared = 0;
      for (let index = 0; index < sample.length; index += 4) {
        const luminance = sample[index] * 0.299 + sample[index + 1] * 0.587 + sample[index + 2] * 0.114;
        total += luminance;
        totalSquared += luminance * luminance;
      }
      const count = sample.length / 4;
      const average = total / count;
      const contrast = Math.sqrt(Math.max(0, totalSquared / count - average * average));
      const tooSmall = Math.min(image.naturalWidth, image.naturalHeight) < 700;
      const dimOrFlat = average < 55 || contrast < 18;
      const quality: PhotoQuality = tooSmall || dimOrFlat
        ? { tone: "warning", message: tooSmall ? "照片解析度偏低，建議靠近題目補拍；仍可先嘗試辨識。" : "已自動提高對比，但光線或筆跡偏淡，請務必核對辨識稿。" }
        : { tone: "ready", message: "已自動校正尺寸與對比。請先辨識，再核對數字、分數線、根號與等號。" };
      let normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.84);
      // Vercel Functions 的 request body 上限為 4.5MB；照片由瀏覽器預先壓縮，
      // 為 tRPC metadata 保留餘裕，同時維持伺服器端 5MB 原始圖片安全上限。
      if (normalizedDataUrl.length > 3_800_000) normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.68);
      if (normalizedDataUrl.length > 3_800_000) { URL.revokeObjectURL(objectUrl); reject(new Error("照片壓縮後仍偏大，請裁切至單一題目後再上傳。")); return; }
      URL.revokeObjectURL(objectUrl);
      resolve({ preview: normalizedDataUrl, normalizedDataUrl, quality });
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("題目照片讀取失敗，請重新選擇檔案。")); };
    image.src = objectUrl;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("題目檔案讀取失敗。"));
    reader.onerror = () => reject(new Error("題目檔案讀取失敗，請重新選擇檔案。"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [grade, setGrade] = useState<Grade>("seven");
  const [unitKey, setUnitKey] = useState(CORE_UNITS.seven[0].key);
  const [mode, setMode] = useState<TutorMode>("guided");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [recognitionDraft, setRecognitionDraft] = useState("");
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [batchSessionId, setBatchSessionId] = useState<string | null>(null);
  const [isExportingHistory, setIsExportingHistory] = useState(false);
  // 從「上傳紀錄」面板選取的檔案：一旦設定，追問會直接使用這個 attachmentId，
  // 不受目前上傳佇列（先進先出）影響，修復「解完第 1 題後無法追問同張照片第 13 題」的問題。
  const [selectedHistoryAttachment, setSelectedHistoryAttachment] = useState<AttachmentHistoryItem | null>(null);

  const curriculum = trpc.tutor.curriculum.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const solutionModes = trpc.tutor.solutionModes.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const batchSettings = trpc.tutor.batchSettings.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const unitsByGrade = curriculum.data?.units ?? CORE_UNITS;
  const units = useMemo(() => unitsByGrade[grade] ?? CORE_UNITS[grade], [grade, unitsByGrade]);
  const unit = units.find(item => item.key === unitKey) ?? units[0];
  const studentModes = (solutionModes.data?.modes ?? DEFAULT_TUTOR_MODES) as StudentMode[];
  const activeMode = studentModes.find(item => item.key === mode) ?? studentModes[0] ?? DEFAULT_TUTOR_MODES[0];
  const ModeIcon = modeIcon(activeMode.key);
  const activeAttachment = attachments[0] ?? null;
  const utils = trpc.useUtils();
  const history = trpc.tutor.learningLoop.useQuery(undefined, { enabled: isAuthenticated }) as unknown as { data?: LearningAttempt[]; isLoading: boolean; refetch: () => unknown };
  const uploadPhoto = trpc.tutor.uploadPhoto.useMutation();
  const recognizePhoto = trpc.tutor.recognizePhoto.useMutation();
  const solve = trpc.tutor.solve.useMutation();
  const startBatchSession = trpc.tutor.startBatchSession.useMutation();
  const maxBatchQuestions = batchSettings.data?.maxBatchQuestions ?? 5;
  const reportConcern = trpc.tutor.reportConcern.useMutation();
  const savePractice = trpc.tutor.savePractice.useMutation();
  const markMistake = trpc.tutor.markMistake.useMutation({
    onSuccess: () => { toast.success("已把這題標記為常犯錯題；可到錯題循環建立二次練習。", { icon: <Tag className="size-4" /> }); void history.refetch(); },
    onError: error => toast.error(error.message || "暫時無法標記錯題，請稍後再試。"),
  });

  useEffect(() => {
    if (!units.some(item => item.key === unitKey)) setUnitKey(units[0].key);
  }, [unitKey, units]);

  useEffect(() => {
    if (!studentModes.some(item => item.key === mode)) setMode(studentModes[0]?.key ?? "guided");
  }, [mode, studentModes]);

  const switchGrade = (nextGrade: Grade) => setGrade(nextGrade);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("已安全登出此裝置。", { icon: <CheckCircle2 className="size-4" /> });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暫時無法登出，請稍後再試。");
    }
  };

  const selectAttachments = async (files: File[]) => {
    try {
      setSelectedHistoryAttachment(null);
      const available = batchSessionId ? 0 : Math.max(0, maxBatchQuestions - attachments.length);
      const limited = files.slice(0, available);
      if (!limited.length) { toast.message(`目前這批最多 ${maxBatchQuestions} 題；請先完成或清除待處理題目。`); return; }
      if (batchSessionId) { toast.message("目前這批已開始處理；請先完成或清除目前題目，再建立下一批。"); return; }
      if (files.length > available) toast.message(`目前這批最多 ${maxBatchQuestions} 題，其餘檔案請分批匯入。`);
      const prepared = await Promise.all(limited.map(async file => {
        const localId = crypto.randomUUID();
        if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超過 5MB，請壓縮或重新拍攝。`);
          return { localId, file, kind: "image" as const, ...(await prepareHandwrittenPhoto(file)) };
        }
        if (file.type === "application/pdf") {
          if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name} 超過 3MB，請只保留題目頁面後再匯入。`);
          return { localId, file, kind: "pdf" as const, normalizedDataUrl: await readFileAsDataUrl(file), quality: { tone: "ready" as const, message: "PDF 已安全匯入。可先讀取題目，再核對辨識稿後送出。" } };
        }
        if (file.type === "text/plain" || /\.(txt|md)$/i.test(file.name)) {
          if (file.size > 200 * 1024) throw new Error(`${file.name} 超過 200KB，請只保留題目內容。`);
          const transcription = (await file.text()).replace(/\u0000/g, "").trim().slice(0, 3500);
          if (!transcription) throw new Error(`${file.name} 沒有可讀取的題目內容。`);
          return { localId, file, kind: "text" as const, transcription, quality: { tone: "ready" as const, message: "已讀取文字內容。請核對後可直接編輯並送出。" } };
        }
        throw new Error(`${file.name} 不是支援的 JPEG、PNG、WebP、PDF、TXT 或 Markdown 題目檔。`);
      }));
      setAttachments(current => [...current, ...prepared]);
      if (!attachments.length) setBatchSessionId(null);
      setRecognitionDraft(prepared[0]?.transcription ?? "");
      toast.success(`已加入 ${prepared.length} 個題目檔案，系統會依序建立解題紀錄。`, { icon: <BadgeCheck className="size-4" /> });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "題目檔案讀取失敗，請重新選擇檔案。");
    }
  };

  const ensureAttachmentUploaded = async () => {
    const attachment = activeAttachment;
    if (!attachment) return undefined;
    if (attachment.kind === "text") return undefined;
    if (attachment.attachmentId) return attachment.attachmentId;
    if (!attachment.normalizedDataUrl) throw new Error("題目檔案尚未完成處理，請重新匯入。");
    const uploaded = await uploadPhoto.mutateAsync({
      filename: attachment.kind === "image" ? attachment.file.name.replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg" : attachment.file.name,
      mimeType: attachment.kind === "pdf" ? "application/pdf" : "image/jpeg",
      dataUrl: attachment.normalizedDataUrl,
    });
    setAttachments(current => current.map(item => item.localId === attachment.localId ? { ...item, attachmentId: uploaded.attachmentId } : item));
    return uploaded.attachmentId;
  };

  const recognizeHandwriting = async () => {
    const attachment = activeAttachment;
    if (!attachment) return;
    if (attachment.kind === "text") return;
    if (!isAuthenticated) { toast.message("請先登入，再使用手寫題目辨識與保存功能。"); setAuthDialogOpen(true); return; }
    try {
      const attachmentId = await ensureAttachmentUploaded();
      if (!attachmentId) return;
      const result = await recognizePhoto.mutateAsync({ attachmentId });
      setRecognitionDraft(result.transcription);
      if (result.remaining !== null) setRemaining(result.remaining);
      setAttachments(current => current.map(item => item.localId === attachment.localId ? {
        ...item,
        attachmentId,
        transcription: result.transcription,
        quality: result.isReadable
          ? { tone: "ready", message: `辨識信心 ${result.confidence}%。請核對後可直接修正辨識稿。` }
          : { tone: "warning", message: `辨識信心 ${result.confidence}%。${result.clarification || result.cropHint || "請補拍後再試。"}` },
      } : item));
      if (result.isReadable) toast.success(attachment.kind === "pdf" ? "已讀取 PDF 題目，可先核對辨識稿再送出。" : "已產生可編輯辨識稿，請核對題目再送出。");
      else toast.message(result.clarification || "題目照片可能不完整，請依提示補拍或直接輸入。", { icon: <CircleHelp className="size-4" /> });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "手寫題目辨識暫時無法使用，請直接輸入題目。");
    }
  };

  const sendQuestion = async (question: string) => {
    if (!isAuthenticated) {
      toast.message("請先登入，再開始保存你的解題與錯題紀錄。");
      setAuthDialogOpen(true);
      return;
    }
    setMessages(current => [...current, { role: "user", content: question }]);
    setLastAttempt(null);
    try {
      // 優先使用「上傳紀錄」面板選取的檔案；否則沿用目前上傳佇列中的下一筆。
      // conversationId 不需要前端傳遞：伺服器會依 attachmentId 自動找回並延續正確的對話。
      let attachmentId: string | undefined;
      if (selectedHistoryAttachment) attachmentId = selectedHistoryAttachment.id;
      else if (activeAttachment) attachmentId = await ensureAttachmentUploaded();

      let activeSessionId = batchSessionId;
      if (activeAttachment && !selectedHistoryAttachment && !activeSessionId) {
        const session = await startBatchSession.mutateAsync({ grade, unitKey: unit.key, questionCount: attachments.length });
        activeSessionId = session.id;
        setBatchSessionId(session.id);
      }
      const result = await solve.mutateAsync({ question, grade, unitKey: unit.key, mode, attachmentId, sessionId: selectedHistoryAttachment ? undefined : activeSessionId ?? undefined });
      setMessages(current => [...current, { role: "assistant", content: result.responseMarkdown }]);
      setLastAttempt({ id: result.attemptId, variationQuestion: result.solution.variationQuestion, confidence: result.solution.confidence, needsClarification: result.solution.needsClarification });
      setRemaining(result.remaining);
      void utils.tutor.listAttachments.invalidate();
      if (selectedHistoryAttachment) {
        // 保持選取狀態，讓學生可以直接針對同一張圖片繼續追問下一題（例如第 13 題）。
      } else {
        const nextAttachment = attachments[1];
        if (nextAttachment) {
          setAttachments(current => current.slice(1));
          setRecognitionDraft(nextAttachment.transcription ?? "");
        } else if (activeAttachment) {
          setRecognitionDraft(activeAttachment.transcription ?? "");
        } else {
          setRecognitionDraft("");
        }
      }
      history.refetch();
      if (result.solution.needsClarification) toast.message("我需要更多題目資訊，請依回覆補拍或補充文字。", { icon: <CircleHelp className="size-4" /> });
    } catch (error) {
      const message = error instanceof Error ? error.message : "解題服務暫時無法使用，請稍後再試。";
      toast.error(message);
      const isCooldown = message.includes("請稍候幾秒再送出");
      const isQuotaLimit = message.includes("今天的解題額度已用完");
      const isProviderBusy = message.includes("解題服務暫時繁忙");
      setMessages(current => [...current, { role: "assistant", content: isCooldown
        ? `## 請稍候再送出\n${message}\n\n> 題目檔案仍保留在佇列中，不必重新上傳。`
        : isQuotaLimit
          ? `## 今日額度已達上限\n${message}\n\n> 你可先到「常犯錯題」回顧與匯出練習單，明天再繼續解題。`
          : isProviderBusy
            ? `## 解題服務暫時繁忙\n${message}\n\n> 這不是題目清晰度問題。請依提示稍候後重試；題目檔案仍保留在佇列中。`
          : "## 暫時無法可靠作答\n我現在無法完成這題的安全檢查。請稍候再試，或改為補上清楚題目與你的作答步驟。\n\n> AI 可能出錯；重要答案請與教師或可驗算步驟交叉確認。" }]);
    }
  };

  const report = async (reason: "wrong_answer" | "teacher_help" | "unclear_photo") => {
    if (!lastAttempt?.id) return;
    try {
      const result = await reportConcern.mutateAsync({ attemptId: lastAttempt.id, reason });
      toast.success(result.notified ? "已通知教師，會納入品質檢查。" : "已記錄回報，教師工作台會顯示此項目。");
    } catch {
      toast.error("回報暫時未送出，請稍後再試。");
    }
  };

  const exportHistory = async (format: "docx" | "pdf") => {
    setIsExportingHistory(true);
    try {
      const result = await utils.client.tutor.exportPracticeSheet.query({ source: "recent", format });
      downloadBase64File(result.filename, result.base64, result.mimeType);
      toast.success("近期學習紀錄練習單已匯出。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "練習單匯出失敗，請稍後再試。");
    } finally {
      setIsExportingHistory(false);
    }
  };

  const saveVariation = async (status: "not_attempted" | "correct" | "incorrect" | "needs_review") => {
    if (!lastAttempt?.id) return;
    try {
      await savePractice.mutateAsync({ sourceAttemptId: lastAttempt.id, question: lastAttempt.variationQuestion, studentAnswer: practiceAnswer || undefined, status });
      toast.success("變式練習已加入你的學習紀錄。");
      setPracticeAnswer("");
      history.refetch();
    } catch {
      toast.error("暫時無法保存練習結果，請稍後再試。");
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-slate-800 selection:bg-[#b9e1d9] selection:text-[#173b4d]">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-[#f7f8f5]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-2xl bg-[#173b4d] text-[#f8cf88] shadow-lg shadow-[#173b4d]/15"><span className="font-serif text-xl font-semibold">∑</span></div><div><p className="text-sm font-bold tracking-tight text-[#173b4d]">數域・解題教練</p><p className="text-[11px] tracking-[0.14em] text-slate-500">JUNIOR MATH STUDIO</p></div></div>
          {loading ? <Loader2 className="size-5 animate-spin text-slate-400" /> : isAuthenticated ? <div className="flex items-center gap-2"><>{(user?.role === "teacher" || user?.role === "admin") && <Link href="/teacher" className="hidden rounded-full bg-[#eaf6f3] px-3 py-1.5 text-xs font-semibold text-[#196b63] transition hover:bg-[#dff1ed] sm:inline">教師工作台</Link>}</><div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-100"><UserRoundCheck className="size-3.5 text-[#196b63]" /><span className="hidden sm:inline">{user?.name || "我的學習空間"}</span><span className="sm:hidden">已登入</span></div><Button type="button" variant="outline" size="sm" onClick={handleLogout} className="rounded-full border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50"><LogOut className="mr-1.5 size-3.5" />登出</Button></div> : <Button onClick={() => setAuthDialogOpen(true)} size="sm" className="rounded-full bg-[#173b4d] px-4 text-xs hover:bg-[#0f2e3d]">登入學習空間</Button>}
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
              {isAuthenticated && curriculum.isFetching && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />正在同步教師核准單元…</p>}
              {isAuthenticated && curriculum.isError && <p className="mt-3 text-xs text-[#9a5b21]">暫時無法同步自訂單元；目前顯示核心課綱。</p>}
            </section>

            <section aria-label="解題模式" className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">{studentModes.map(item => { const Icon = modeIcon(item.key); const selected = mode === item.key; return <button key={item.key} onClick={() => setMode(item.key)} className={`w-[15rem] shrink-0 rounded-2xl border p-4 text-left transition sm:w-auto ${selected ? "border-[#196b63] bg-[#eaf6f3] shadow-[0_12px_25px_-20px_rgba(25,107,99,0.7)]" : "border-slate-200 bg-white hover:border-[#a7d4cd] hover:bg-[#fcfefd]"}`}><div className="flex items-center gap-2"><div className={`flex size-8 items-center justify-center rounded-xl ${selected ? "bg-[#196b63] text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="size-4" /></div><span className="text-sm font-semibold text-slate-800">{item.name}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p></button>; })}</section>

            {!isAuthenticated && !loading && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#f2dba9] bg-[#fff9ea] p-4 text-sm text-[#74511b]"><AlertCircle className="mt-0.5 size-5 shrink-0" /><p>你可以先瀏覽介面；登入後才會啟用安全上傳、品牌託管解題、錯題保存與教師協助通知。</p></div>}
            <AIChatBox
              messages={messages}
              onSendMessage={sendQuestion}
              onAttachmentsSelected={selectAttachments}
              onClearAttachment={() => {
                if (selectedHistoryAttachment) { setSelectedHistoryAttachment(null); setRecognitionDraft(""); return; }
                const next = attachments[1];
                setAttachments(current => current.slice(1));
                setBatchSessionId(next ? batchSessionId : null);
                setRecognitionDraft(next?.transcription ?? "");
              }}
              onRecognizePhoto={recognizeHandwriting}
              onAttachmentTranscriptionChange={value => {
                setRecognitionDraft(value);
                if (selectedHistoryAttachment) return;
                if (activeAttachment) setAttachments(current => current.map(item => item.localId === activeAttachment.localId ? { ...item, transcription: value } : item));
              }}
              attachmentName={selectedHistoryAttachment ? selectedHistoryAttachment.filename : activeAttachment?.file.name}
              attachmentPreview={selectedHistoryAttachment ? undefined : activeAttachment?.preview}
              attachmentKind={selectedHistoryAttachment ? "text" : activeAttachment?.kind}
              attachmentTranscription={recognitionDraft}
              queuedAttachmentNames={selectedHistoryAttachment ? [] : attachments.slice(1).map(item => item.file.name)}
              photoQuality={selectedHistoryAttachment ? { tone: "ready", message: "已選取上傳紀錄中的題目，直接輸入你的追問即可。" } : activeAttachment?.quality}
              isRecognizing={recognizePhoto.isPending}
              isLoading={solve.isPending || uploadPhoto.isPending}
              suggestedPrompts={suggestedPromptsForUnit(grade, unit.key, unit.label)}
              batchMaxQuestions={maxBatchQuestions}
            />

            {lastAttempt && (lastAttempt.id ? (
              <section className="mt-5 rounded-[1.5rem] border border-[#d8ebe7] bg-[#f7fcfa] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#173b4d]"><NotebookPen className="size-4 text-[#196b63]" />把這題變成你的學習資產</p><p className="mt-1 text-xs leading-5 text-slate-500">信心指標 {lastAttempt.confidence}%{lastAttempt.needsClarification ? "・需要補充題目資訊" : "・已完成結構化解題"}</p></div><div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:flex-wrap"><Button size="sm" variant="outline" onClick={() => markMistake.mutate({ attemptId: lastAttempt.id!, markedWrong: true })} disabled={markMistake.isPending} className="shrink-0 rounded-full border-[#d8bd79] bg-white text-[#76521a] hover:bg-[#fffaf0]"><Tag className="mr-1.5 size-3.5" />標記為常犯錯題</Button><Button size="sm" variant="outline" onClick={() => report("wrong_answer")} disabled={reportConcern.isPending} className="shrink-0 rounded-full border-[#eacbc2] bg-white text-[#9a4331] hover:bg-[#fff5f2]"><FileWarning className="mr-1.5 size-3.5" />回報答案問題</Button><Button size="sm" onClick={() => report("teacher_help")} disabled={reportConcern.isPending} className="shrink-0 rounded-full bg-[#173b4d] hover:bg-[#0f2e3d]"><GraduationCap className="mr-1.5 size-3.5" />請教師協助</Button></div></div>
                <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-[#d8ebe7]"><p className="text-xs font-semibold text-[#196b63]">變式練習</p><p className="mt-1 text-sm leading-6 text-slate-700">{lastAttempt.variationQuestion}</p><Textarea value={practiceAnswer} onChange={event => setPracticeAnswer(event.target.value)} placeholder="可先寫下你的答案或思路，之後再回來檢查。" className="mt-3 min-h-20 border-slate-200 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => saveVariation("not_attempted")} disabled={savePractice.isPending} className="rounded-full">稍後練習</Button><Button size="sm" variant="outline" onClick={() => saveVariation("needs_review")} disabled={savePractice.isPending} className="rounded-full">完成，請幫我回顧</Button><Button size="sm" onClick={() => saveVariation("correct")} disabled={savePractice.isPending} className="rounded-full bg-[#196b63] hover:bg-[#115950]">我已完成</Button></div></div>
              </section>
            ) : (
              // 這次是因為上傳的照片／檔案資訊不足才需要補充，不會寫入學習紀錄，所以沒有可標記／建立練習的對象。
              <section className="mt-5 rounded-[1.5rem] border border-[#f0dcc0] bg-[#fffaf2] p-4 text-xs leading-5 text-[#8a5a1f] sm:p-5">
                圖片或檔案的題目資訊還不夠完整，這次不會計入學習紀錄。請補拍清楚一點，或直接補充題目文字後再問一次。
              </section>
            ))}
          </div>

          <aside className="space-y-5 lg:pt-1">
            {isAuthenticated && (
              <AttachmentHistoryPanel
                selectedAttachmentId={selectedHistoryAttachment?.id ?? null}
                onSelect={item => {
                  setSelectedHistoryAttachment(item);
                  setRecognitionDraft(item?.transcription ?? "");
                  if (item) { setAttachments([]); setBatchSessionId(null); }
                }}
              />
            )}
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">TODAY'S FOCUS</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-[#173b4d]">{GRADE_LABELS[grade]}・{unit.label}</h2></div><div className="flex size-10 items-center justify-center rounded-2xl bg-[#f4e8d6] text-[#9a5b21]"><ModeIcon className="size-5" /></div></div><div className="mt-5 rounded-2xl bg-[#f7f8f5] p-3"><p className="text-xs text-slate-500">目前模式</p><p className="mt-1 text-sm font-semibold text-slate-700">{activeMode.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{activeMode.description}</p></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs"><span className="flex items-center gap-1.5 text-slate-500"><Clock3 className="size-3.5" />每日安全額度</span><span className="font-semibold text-[#196b63]">{remaining === null ? "20 題上限" : `今日剩餘 ${remaining} 題`}</span></div></section>
            <section className="rounded-[1.5rem] bg-[#e9f4f1] p-5"><p className="flex items-center gap-2 text-sm font-semibold text-[#173b4d]"><ShieldCheck className="size-4 text-[#196b63]" />可靠解題守則</p><div className="mt-4 space-y-3 text-xs leading-5 text-slate-600"><p>先確認題意；照片模糊或條件不足時，會請你補拍或補充文字。</p><p>每次回覆固定提供題意、關鍵觀念、步驟理由、驗算與易錯點。</p><p>AI 可能犯錯；重要答案請檢查步驟，或直接請教師協助。</p></div></section>
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">我的錯題循環</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-[#173b4d]">近期學習紀錄</h2></div>{isAuthenticated ? <ExportFormatMenu label="匯出" isExporting={isExportingHistory} disabled={!history.data?.length} onExport={format => void exportHistory(format)} /> : <Upload className="size-5 text-slate-300" />}</div>{!isAuthenticated ? <p className="mt-4 text-sm leading-6 text-slate-500">登入後，這裡會整理你解過的題目、錯誤標籤與變式練習。</p> : history.isLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />正在讀取紀錄…</div> : history.data?.length ? <div className="mt-4 space-y-3">{history.data.slice(0, 4).map(item => { let tags: string[] = []; try { tags = JSON.parse(item.errorTags); } catch { tags = []; } return <div key={item.id} className="rounded-xl border border-slate-100 bg-[#fcfdfc] p-3"><p className="line-clamp-2 text-xs font-medium leading-5 text-slate-700">{item.questionText}</p><div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-slate-400">信心 {item.confidence}%</span><span className="text-[#196b63]">{tags[0] || "已完成"}</span></div></div>; })}<Link href="/review" className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#196b63] hover:text-[#115950]">查看完整錯題本 <ArrowRight className="size-3.5" /></Link></div> : <div className="mt-4 rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">第一筆解題紀錄會出現在這裡。完成後請回看變式練習，建立真正的錯題循環。</div>}</section>
          </aside>
        </section>
      </main>
      <AuthDialogNext open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </div>
  );
}
