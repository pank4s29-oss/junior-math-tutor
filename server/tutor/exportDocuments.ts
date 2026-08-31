import fontkit from "@pdf-lib/fontkit";
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const CJK_FONT_PATH = join(moduleDir, "..", "assets", "fonts", "jf-openhuninn-1.1.ttf");

type PracticeAttempt = {
  questionText: string;
  unitKey: string;
  studentMarkedWrong: boolean;
};

/** 僅供目前學生下載的練習單資料，不含解答、照片或其他使用者資料。 */
function selectPracticeRows<T extends PracticeAttempt>(attempts: T[], source: "frequent" | "recent") {
  const rows = source === "frequent" ? attempts.filter(item => item.studentMarkedWrong) : attempts;
  return rows.slice(0, 20);
}

function sheetTitle(source: "frequent" | "recent") {
  return source === "frequent" ? "常犯錯題練習單" : "近期學習紀錄練習單";
}

const INTRO_TEXT = "請先獨立作答，再逐步寫下理由與驗算。這份練習單僅包含你自己的題幹，不含解答、照片或其他同學資料。";
const EMPTY_TEXT = "目前沒有可匯出的題目。";
const CJK_FONT_NAME = "微軟正黑體";

// ---------------------------------------------------------------------------
// Word（.docx）匯出
// ---------------------------------------------------------------------------

function writingLine() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF" } },
    children: [new TextRun({ text: "", font: CJK_FONT_NAME })],
  });
}

export async function buildPracticeSheetDocx<T extends PracticeAttempt>(attempts: T[], source: "frequent" | "recent"): Promise<Buffer> {
  const rows = selectPracticeRows(attempts, source);
  const title = sheetTitle(source);

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: CJK_FONT_NAME })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: INTRO_TEXT, font: CJK_FONT_NAME, size: 20, color: "555555" })] }),
  ];

  if (!rows.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: EMPTY_TEXT, font: CJK_FONT_NAME })] }));
  }

  rows.forEach((item, index) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 120 },
      children: [new TextRun({ text: `${index + 1}. ${item.unitKey}`, font: CJK_FONT_NAME })],
    }));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: item.questionText, font: CJK_FONT_NAME, size: 22 })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: "我的作法：", font: CJK_FONT_NAME, bold: true, size: 20 })] }));
    children.push(writingLine());
    children.push(writingLine());
    children.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: "驗算／檢查：", font: CJK_FONT_NAME, bold: true, size: 20 })] }));
    children.push(writingLine());
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: CJK_FONT_NAME } } } },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// PDF 匯出
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 20;

function wrapLines(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const char of Array.from(paragraph)) {
      const candidate = current + char;
      if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

class PdfWriter {
  doc: PDFDocument;
  font: PDFFont;
  page!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, font: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN) this.addPage();
  }

  writeText(text: string, { size = 12, gap = 6, color = rgb(0.16, 0.16, 0.16) }: { size?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) {
    const lines = wrapLines(this.font, text, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(LINE_HEIGHT);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.font, color });
      this.y -= LINE_HEIGHT;
    }
    this.y -= gap;
  }

  writeRule() {
    this.ensureSpace(LINE_HEIGHT * 2);
    this.y -= 6;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });
    this.y -= LINE_HEIGHT + 6;
  }
}

export async function buildPracticeSheetPdf<T extends PracticeAttempt>(attempts: T[], source: "frequent" | "recent"): Promise<Buffer> {
  const rows = selectPracticeRows(attempts, source);
  const title = sheetTitle(source);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let font: PDFFont;
  try {
    const fontBytes = readFileSync(CJK_FONT_PATH);
    // 注意：pdf-lib 內建的子集化（subset）在這款字型的部分複合字符（composite glyph）
    // 上有已知錯誤，會導致中文字缺字。改為完整嵌入字型以確保所有中文字元正確顯示。
    font = await pdfDoc.embedFont(fontBytes, { subset: false });
  } catch {
    // 若字型檔案暫時無法讀取，退回內建字型（僅能正確顯示英數字）。
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const writer = new PdfWriter(pdfDoc, font);
  writer.writeText(title, { size: 22, gap: 12 });
  writer.writeText(INTRO_TEXT, { size: 11, gap: 16, color: rgb(0.42, 0.42, 0.42) });

  if (!rows.length) {
    writer.writeText(EMPTY_TEXT, { size: 12 });
  }

  rows.forEach((item, index) => {
    writer.writeRule();
    writer.writeText(`${index + 1}. ${item.unitKey}`, { size: 14, gap: 8 });
    writer.writeText(item.questionText, { size: 12, gap: 14 });
    writer.writeText("我的作法：", { size: 11, gap: 2, color: rgb(0.3, 0.3, 0.3) });
    writer.ensureSpace(LINE_HEIGHT * 2);
    writer.y -= LINE_HEIGHT * 2;
    writer.writeText("驗算／檢查：", { size: 11, gap: 2, color: rgb(0.3, 0.3, 0.3) });
    writer.ensureSpace(LINE_HEIGHT);
    writer.y -= LINE_HEIGHT;
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
