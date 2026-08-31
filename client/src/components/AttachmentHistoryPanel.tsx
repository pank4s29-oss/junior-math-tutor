import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Check, FileText, ImageIcon, Loader2, MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type AttachmentHistoryItem = {
  id: string;
  filename: string;
  mimeType: string;
  recognitionStatus: string;
  transcription: string | null;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
};

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

/**
 * 修復：學生上傳一張含多題的照片，解完第 1 題後再追問第 13 題時，
 * 前端過去只用「先進先出佇列」暫存附件，解完就從畫面上丟棄，導致 AI 完全看不到先前上傳的內容。
 * 這個面板把每一次上傳都變成可長期瀏覽、可重新選取繼續追問、可編輯辨識文字、可刪除的紀錄，
 * 不再依賴「目前佇列的第一筆」這種一次性狀態。
 */
export function AttachmentHistoryPanel({
  selectedAttachmentId,
  onSelect,
}: {
  selectedAttachmentId: string | null;
  onSelect: (item: AttachmentHistoryItem | null) => void;
}) {
  const utils = trpc.useUtils();
  const list = trpc.tutor.listAttachments.useQuery();
  const previewUrl = trpc.tutor.getAttachmentPreviewUrl.useQuery(
    { attachmentId: selectedAttachmentId ?? "" },
    { enabled: Boolean(selectedAttachmentId) }
  );
  const renameAttachment = trpc.tutor.renameAttachment.useMutation({
    onSuccess: () => { void utils.tutor.listAttachments.invalidate(); },
    onError: error => toast.error(error.message || "重新命名失敗，請稍後再試。"),
  });
  const updateTranscription = trpc.tutor.updateAttachmentTranscription.useMutation({
    onSuccess: () => { toast.success("已更新辨識文字。"); void utils.tutor.listAttachments.invalidate(); },
    onError: error => toast.error(error.message || "更新辨識文字失敗，請稍後再試。"),
  });
  const deleteAttachment = trpc.tutor.deleteAttachment.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("已刪除這筆上傳紀錄。");
      void utils.tutor.listAttachments.invalidate();
      if (variables.attachmentId === selectedAttachmentId) onSelect(null);
    },
    onError: error => toast.error(error.message || "刪除失敗，請稍後再試。"),
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingTranscriptionId, setEditingTranscriptionId] = useState<string | null>(null);
  const [transcriptionDraft, setTranscriptionDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const items: AttachmentHistoryItem[] = list.data ?? [];

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#196b63]">上傳紀錄</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-[#173b4d]">選一份繼續追問</h2>
        </div>
        {list.isFetching && <Loader2 className="size-4 animate-spin text-slate-300" />}
      </div>

      {list.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />正在讀取上傳紀錄…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#f7f8f5] p-3 text-xs leading-5 text-slate-500">上傳過的題目照片或檔案會保留在這裡；之後可以隨時點回來繼續追問同一題，不需要重新上傳。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map(item => {
            const isSelected = item.id === selectedAttachmentId;
            const isRenaming = renamingId === item.id;
            const isEditingTranscription = editingTranscriptionId === item.id;
            const isConfirmingDelete = confirmingDeleteId === item.id;
            return (
              <li key={item.id} className={cn("rounded-2xl border p-3 transition", isSelected ? "border-[#196b63] bg-[#eaf6f3]" : "border-slate-200 bg-[#fcfdfc] hover:border-[#a7d4cd]")}>
                <div className="flex items-start gap-2">
                  {item.mimeType === "application/pdf" ? <FileText className="mt-0.5 size-4 shrink-0 text-[#196b63]" /> : <ImageIcon className="mt-0.5 size-4 shrink-0 text-[#196b63]" />}
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <input value={renameDraft} onChange={event => setRenameDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" autoFocus />
                        <button type="button" aria-label="儲存名稱" className="rounded-md p-1 text-[#196b63] hover:bg-white" onClick={() => { const filename = renameDraft.trim(); if (filename) renameAttachment.mutate({ attachmentId: item.id, filename }); setRenamingId(null); }}><Check className="size-3.5" /></button>
                        <button type="button" aria-label="取消重新命名" className="rounded-md p-1 text-slate-400 hover:bg-white" onClick={() => setRenamingId(null)}><X className="size-3.5" /></button>
                      </div>
                    ) : (
                      <p className="truncate text-xs font-semibold text-[#173b4d]">{item.filename}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-400">{formatTimestamp(item.createdAt)}・{item.recognitionStatus === "readable" ? "辨識完成" : item.recognitionStatus === "unclear" ? "待補充" : "尚未辨識"}</p>
                  </div>
                </div>

                {isEditingTranscription ? (
                  <div className="mt-2">
                    <Textarea value={transcriptionDraft} onChange={event => setTranscriptionDraft(event.target.value)} rows={3} className="min-h-16 border-[#dcebe8] bg-white text-xs leading-5" />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => setEditingTranscriptionId(null)}>取消</Button>
                      <Button size="sm" className="h-7 rounded-full bg-[#196b63] px-2.5 text-[11px] hover:bg-[#115950]" onClick={() => { updateTranscription.mutate({ attachmentId: item.id, transcription: transcriptionDraft }); setEditingTranscriptionId(null); }}>儲存</Button>
                    </div>
                  </div>
                ) : item.transcription ? (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-white px-2 py-1.5 text-[11px] leading-4 text-slate-500 ring-1 ring-slate-100">{item.transcription}</p>
                ) : null}

                {isConfirmingDelete ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-[#fff5f2] px-2 py-1.5 text-[11px] text-[#9a4331]">
                    <span>確定要刪除這筆上傳紀錄嗎？</span>
                    <div className="flex gap-1.5">
                      <button type="button" className="rounded-md px-1.5 py-0.5 hover:bg-white" onClick={() => setConfirmingDeleteId(null)}>取消</button>
                      <button type="button" className="rounded-md bg-[#9a4331] px-1.5 py-0.5 font-semibold text-white" onClick={() => { deleteAttachment.mutate({ attachmentId: item.id }); setConfirmingDeleteId(null); }}>確定刪除</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant={isSelected ? "default" : "outline"} className={cn("h-7 rounded-full px-2.5 text-[11px]", isSelected ? "bg-[#196b63] hover:bg-[#115950]" : "")} onClick={() => onSelect(isSelected ? null : item)}>
                      <MessageSquareText className="mr-1 size-3 shrink-0" />{isSelected ? "使用中" : "選取繼續追問"}
                    </Button>
                    <button type="button" aria-label="重新命名" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-[#196b63]" onClick={() => { setRenamingId(item.id); setRenameDraft(item.filename); }}><Pencil className="size-3.5" /></button>
                    <button type="button" aria-label="編輯辨識文字" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-[#196b63]" onClick={() => { setEditingTranscriptionId(item.id); setTranscriptionDraft(item.transcription ?? ""); }}><FileText className="size-3.5" /></button>
                    <button type="button" aria-label="刪除這筆上傳紀錄" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-[#9a4331]" onClick={() => setConfirmingDeleteId(item.id)}><Trash2 className="size-3.5" /></button>
                  </div>
                )}

                {isSelected && previewUrl.data?.url && item.mimeType !== "application/pdf" && (
                  <img src={previewUrl.data.url} alt={`${item.filename} 預覽`} className="mt-2 max-h-40 w-full rounded-xl object-contain ring-1 ring-slate-100" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
