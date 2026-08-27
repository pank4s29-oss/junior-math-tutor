import { Button } from "@/components/ui/button";
import { MathFormulaEditor } from "@/components/MathFormulaEditor";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BadgeCheck, FileImage, Loader2, Paperclip, ScanLine, Send, Sparkles, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type PhotoQuality = { tone: "ready" | "warning"; message: string };

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onAttachmentSelected?: (file: File) => void;
  onClearAttachment?: () => void;
  onRecognizePhoto?: () => void;
  onAttachmentTranscriptionChange?: (value: string) => void;
  attachmentName?: string;
  attachmentPreview?: string;
  attachmentTranscription?: string;
  photoQuality?: PhotoQuality | null;
  isRecognizing?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
};

function InlineTutorText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</>;
}

/** Renders the fixed, safe subset of markdown returned by the tutoring engine without injecting raw HTML. */
function TutorResponse({ content }: { content: string }) {
  const lines = content.split("\n");
  const rendered: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    rendered.push(<ul key={`list-${rendered.length}`} className="my-2 list-disc space-y-1 pl-5 text-slate-600">{bullets.map((item, index) => <li key={index}><InlineTutorText text={item} /></li>)}</ul>);
    bullets = [];
  };
  lines.forEach((line, index) => {
    if (line.startsWith("- ") || /^\d+\.\s/.test(line)) { bullets.push(line.replace(/^(- |\d+\.\s)/, "")); return; }
    flushBullets();
    if (line.startsWith("## ")) rendered.push(<h3 key={index} className="mt-4 text-base font-semibold text-[#173b4d] first:mt-0"><InlineTutorText text={line.slice(3)} /></h3>);
    else if (line.startsWith("> ")) rendered.push(<p key={index} className="my-2 rounded-r-lg border-l-2 border-[#9acfc6] bg-[#eef8f6] px-3 py-2 text-xs leading-5 text-[#196b63]"><InlineTutorText text={line.slice(2)} /></p>);
    else if (line.trim()) rendered.push(<p key={index} className="my-2 whitespace-pre-wrap"><InlineTutorText text={line} /></p>);
  });
  flushBullets();
  return <div>{rendered}</div>;
}

/** A reusable tutoring conversation surface with markdown, a formula editor and handwriting-friendly image attachment. */
export function AIChatBox({
  messages, onSendMessage, onAttachmentSelected, onClearAttachment, onRecognizePhoto, onAttachmentTranscriptionChange,
  attachmentName, attachmentPreview, attachmentTranscription = "", photoQuality, isRecognizing = false, isLoading = false,
  placeholder = "輸入題目、你的作法，或用公式編輯器輸入算式…", className, height = "min(62vh, 700px)",
  emptyStateMessage = "從一題你正在思考的數學題開始", suggestedPrompts,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [formula, setFormula] = useState("");
  const [showFormula, setShowFormula] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayMessages = messages.filter(message => message.role !== "system");

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [displayMessages.length, isLoading]);

  const send = () => {
    const sections = [input.trim(), formula.trim() ? `【數學式 LaTeX】\n${formula.trim()}` : "", attachmentTranscription.trim() ? `【照片辨識文字（學生已確認／可再修正）】\n${attachmentTranscription.trim()}` : ""].filter(Boolean);
    if ((!sections.length && !attachmentName) || isLoading) return;
    onSendMessage(sections.join("\n\n") || "請協助辨識並帶我解這張題目照片。");
    setInput("");
    setFormula("");
    setShowFormula(false);
    textareaRef.current?.focus();
  };

  return <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]", className)} style={{ height }}>
    <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
      {displayMessages.length === 0 ? <div className="flex h-full flex-col items-center justify-center px-5 py-10 text-center"><div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#e5f3f0] text-[#196b63] shadow-sm"><Sparkles className="size-6" /></div><p className="max-w-xs text-base font-semibold tracking-tight text-slate-800">{emptyStateMessage}</p><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">輸入題目、用公式編輯器建立算式，或附上清楚手寫照片。我會先確認題意，再帶你一步一步思考。</p>{suggestedPrompts && suggestedPrompts.length > 0 && <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">{suggestedPrompts.map(prompt => <button key={prompt} onClick={() => onSendMessage(prompt)} disabled={isLoading} className="rounded-full border border-[#cfe6e2] bg-[#f7fbfa] px-3.5 py-2 text-sm text-[#196b63] transition hover:-translate-y-0.5 hover:bg-[#eaf6f3] disabled:cursor-not-allowed disabled:opacity-60">{prompt}</button>)}</div>}</div> : <ScrollArea className="h-full"><div className="space-y-5 px-4 py-5 sm:px-6">{displayMessages.map((message, index) => <article key={`${message.role}-${index}`} className={cn("flex items-start gap-3", message.role === "user" ? "justify-end" : "justify-start")}>{message.role === "assistant" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5f3f0] text-[#196b63]"><Sparkles className="size-4" /></div>}<div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[80%]", message.role === "user" ? "rounded-tr-md bg-[#173b4d] text-white" : "rounded-tl-md bg-[#f7faf9] text-slate-700 ring-1 ring-slate-100")}>{message.role === "assistant" ? <TutorResponse content={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}</div>{message.role === "user" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4e8d6] text-[#9a5b21]"><User className="size-4" /></div>}</article>)}{isLoading && <div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-full bg-[#e5f3f0] text-[#196b63]"><Sparkles className="size-4" /></div><div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[#f7faf9] px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100"><Loader2 className="size-4 animate-spin" />正在整理解題步驟與驗算…</div></div>}</div></ScrollArea>}
    </div>
    <div className="border-t border-slate-100 bg-[#fcfdfc] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
      {attachmentName && <div className="mb-3 rounded-2xl border border-[#d8ebe7] bg-[#f7fcfa] p-3"><div className="flex items-start gap-3">{attachmentPreview ? <img src={attachmentPreview} alt="題目照片預覽" className="size-12 rounded-xl object-cover ring-1 ring-[#cfe5e0]" /> : <FileImage className="size-5 text-[#196b63]" />}<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#173b4d]">已附上：{attachmentName}</p>{photoQuality && <p className={cn("mt-1 text-[11px] leading-4", photoQuality.tone === "ready" ? "text-[#196b63]" : "text-[#9a5b21]")}>{photoQuality.message}</p>}</div><button onClick={onClearAttachment} type="button" aria-label="移除題目照片" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X className="size-4" /></button></div><div className="mt-3 flex items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-[11px] text-slate-500"><ScanLine className="size-3.5 text-[#196b63]" />先辨識後可修正，降低手寫符號誤讀。</p><Button onClick={onRecognizePhoto} disabled={isLoading || isRecognizing} variant="outline" size="sm" className="shrink-0 rounded-full border-[#a7d4cd] bg-white text-xs text-[#196b63] hover:bg-[#eaf6f3]">{isRecognizing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ScanLine className="mr-1.5 size-3.5" />}辨識手寫題目</Button></div>{(attachmentTranscription || isRecognizing) && <div className="mt-3">{isRecognizing ? <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-[#dcebe8]"><Loader2 className="mr-1.5 inline size-3.5 animate-spin" />正在讀取手寫文字、分數線、根號與指數…</div> : <><label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#196b63]"><BadgeCheck className="size-3.5" />辨識稿可直接編輯</label><Textarea value={attachmentTranscription} onChange={event => onAttachmentTranscriptionChange?.(event.target.value)} placeholder="辨識後的題目會出現在這裡。請核對數字、符號、分數與等號。" rows={3} className="min-h-18 border-[#dcebe8] bg-white text-xs leading-5" /></>}</div>}</div>}
      {showFormula && <MathFormulaEditor value={formula} onChange={setFormula} disabled={isLoading} className="mb-3" />}
      <div className="mb-2 flex items-center justify-between px-1"><button type="button" onClick={() => setShowFormula(current => !current)} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#196b63] hover:text-[#115950]"><span className="rounded-md bg-[#e5f3f0] px-1.5 py-0.5 font-serif text-sm">x²</span>{showFormula ? "收起公式編輯器" : "開啟公式編輯器"}</button><span className="text-[10px] text-slate-400">支援分數、根號、次方、方程式</span></div>
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-[#5fa89e] focus-within:ring-4 focus-within:ring-[#dff1ed]"><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onAttachmentSelected?.(file); event.currentTarget.value = ""; }} /><Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-xl text-slate-500 hover:bg-[#eef7f5] hover:text-[#196b63]" onClick={() => fileInputRef.current?.click()} aria-label="上傳題目照片"><Paperclip className="size-5" /></Button><Textarea ref={textareaRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={placeholder} rows={1} className="min-h-10 max-h-32 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0" /><Button type="button" size="icon" disabled={isLoading || (!input.trim() && !formula.trim() && !attachmentName)} onClick={send} className="size-10 shrink-0 rounded-xl bg-[#196b63] hover:bg-[#115950]"><Send className="size-4" /></Button></div><p className="px-2 pt-2 text-[11px] leading-4 text-slate-400">Enter 送出，Shift + Enter 換行。AI 可能出錯；重要結果請檢查步驟與驗算。</p>
    </div>
  </section>;
}
