import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Download, FileText, Loader2 } from "lucide-react";

export type ExportFormat = "docx" | "pdf";

type ExportFormatMenuProps = {
  /** 按鈕文字，預設「匯出」。 */
  label?: string;
  isExporting?: boolean;
  disabled?: boolean;
  onExport: (format: ExportFormat) => void;
  className?: string;
};

/**
 * 下拉選單：讓學生選擇要把練習單匯出成 Word（.docx）或 PDF（.pdf）。
 */
export function ExportFormatMenu({ label = "匯出", isExporting = false, disabled = false, onExport, className }: ExportFormatMenuProps) {
  const isDisabled = disabled || isExporting;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isDisabled}
          className={cn("shrink-0 rounded-full", className)}
        >
          {isExporting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
          {isExporting ? "匯出中…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onSelect={() => onExport("docx")}>
          <FileText className="size-4" />
          Word 文件（.docx）
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("pdf")}>
          <FileText className="size-4" />
          PDF 檔案（.pdf）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
