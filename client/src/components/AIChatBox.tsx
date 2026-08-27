import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { FileImage, Loader2, Paperclip, Send, Sparkles, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onAttachmentSelected?: (file: File) => void;
  onClearAttachment?: () => void;
  attachmentName?: string;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
};

/** A reusable tutoring conversation surface with markdown, image attachment and mobile-safe composer. */
export function AIChatBox({
  messages,
  onSendMessage,
  onAttachmentSelected,
  onClearAttachment,
  attachmentName,
  isLoading = false,
  placeholder = "輸入你的數學題目…",
  className,
  height = "min(62vh, 700px)",
  emptyStateMessage = "從一題你正在思考的數學題開始",
  suggestedPrompts,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayMessages = messages.filter(message => message.role !== "system");

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [displayMessages.length, isLoading]);

  const send = () => {
    const text = input.trim();
    if ((!text && !attachmentName) || isLoading) return;
    onSendMessage(text || "請協助辨識並帶我解這張題目照片。");
    setInput("");
    textareaRef.current?.focus();
  };

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]", className)} style={{ height }}>
      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 py-10 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#e5f3f0] text-[#196b63] shadow-sm">
              <Sparkles className="size-6" />
            </div>
            <p className="max-w-xs text-base font-semibold tracking-tight text-slate-800">{emptyStateMessage}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">選擇學習模式後，輸入題目或附上清楚照片。我會先確認題意，再帶你一步一步思考。</p>
            {suggestedPrompts && suggestedPrompts.length > 0 && (
              <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                {suggestedPrompts.map(prompt => (
                  <button key={prompt} onClick={() => onSendMessage(prompt)} disabled={isLoading} className="rounded-full border border-[#cfe6e2] bg-[#f7fbfa] px-3.5 py-2 text-sm text-[#196b63] transition hover:-translate-y-0.5 hover:bg-[#eaf6f3] disabled:cursor-not-allowed disabled:opacity-60">
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-5 px-4 py-5 sm:px-6">
              {displayMessages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={cn("flex items-start gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.role === "assistant" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5f3f0] text-[#196b63]"><Sparkles className="size-4" /></div>}
                  <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[80%]", message.role === "user" ? "rounded-tr-md bg-[#173b4d] text-white" : "rounded-tl-md bg-[#f7faf9] text-slate-700 ring-1 ring-slate-100")}>
                    {message.role === "assistant" ? <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:font-semibold prose-headings:text-[#173b4d] prose-p:my-2 prose-strong:text-slate-800 prose-li:my-0"><Streamdown>{message.content}</Streamdown></div> : <p className="whitespace-pre-wrap">{message.content}</p>}
                  </div>
                  {message.role === "user" && <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4e8d6] text-[#9a5b21]"><User className="size-4" /></div>}
                </article>
              ))}
              {isLoading && <div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-full bg-[#e5f3f0] text-[#196b63]"><Sparkles className="size-4" /></div><div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[#f7faf9] px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100"><Loader2 className="size-4 animate-spin" />正在整理解題步驟與驗算…</div></div>}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="border-t border-slate-100 bg-[#fcfdfc] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        {attachmentName && <div className="mb-2 flex items-center justify-between rounded-xl bg-[#eaf6f3] px-3 py-2 text-xs text-[#196b63]"><span className="flex min-w-0 items-center gap-2"><FileImage className="size-4 shrink-0" /><span className="truncate">已附上：{attachmentName}</span></span><button onClick={onClearAttachment} type="button" aria-label="移除題目照片" className="rounded-md p-1 hover:bg-white"><X className="size-4" /></button></div>}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-[#5fa89e] focus-within:ring-4 focus-within:ring-[#dff1ed]">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onAttachmentSelected?.(file); event.currentTarget.value = ""; }} />
          <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-xl text-slate-500 hover:bg-[#eef7f5] hover:text-[#196b63]" onClick={() => fileInputRef.current?.click()} aria-label="上傳題目照片"><Paperclip className="size-5" /></Button>
          <Textarea ref={textareaRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={placeholder} rows={1} className="min-h-10 max-h-32 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0" />
          <Button type="button" size="icon" disabled={isLoading || (!input.trim() && !attachmentName)} onClick={send} className="size-10 shrink-0 rounded-xl bg-[#196b63] hover:bg-[#115950]"><Send className="size-4" /></Button>
        </div>
        <p className="px-2 pt-2 text-[11px] leading-4 text-slate-400">Enter 送出，Shift + Enter 換行。AI 可能出錯；重要結果請檢查步驟與驗算。</p>
      </div>
    </section>
  );
}
