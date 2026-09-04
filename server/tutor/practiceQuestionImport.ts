import type { PracticeDifficulty } from "../../shared/mathCurriculum";

export type ParsedPracticeQuestionRow = {
  difficulty: PracticeDifficulty;
  questionText: string;
  keyConcept: string;
  difficultyNote: string;
};

export type PracticeQuestionImportResult = {
  rows: ParsedPracticeQuestionRow[];
  skipped: Array<{ line: number; reason: string }>;
};

/** 每次匯入的題數上限，避免單次請求過大、也避免誤把整份題庫檔案倒進單一單元。 */
export const MAX_IMPORT_ROWS = 200;
const MAX_QUESTION_LENGTH = 2000;
const MAX_NOTE_LENGTH = 200;

const DIFFICULTY_ALIASES: Record<string, PracticeDifficulty> = {
  "入門": "intro", "intro": "intro", "beginner": "intro", "簡單": "intro",
  "基礎": "standard", "standard": "standard", "基本": "standard", "中等": "standard",
  "進階": "challenge", "挑戰": "challenge", "challenge": "challenge", "困難": "challenge", "hard": "challenge",
};

type ColumnKey = "difficulty" | "questionText" | "keyConcept" | "difficultyNote";
const HEADER_ALIASES: Record<string, ColumnKey> = {
  "難度": "difficulty", "difficulty": "difficulty",
  "題目": "questionText", "題目內容": "questionText", "question": "questionText", "questiontext": "questionText",
  "關鍵觀念": "keyConcept", "keyconcept": "keyConcept",
  "難度說明": "difficultyNote", "difficultynote": "difficultyNote", "note": "difficultyNote",
};

/**
 * 把整份 CSV 文字拆成一列一列、一欄一欄的字串陣列，支援 RFC 4180 的雙引號括住欄位
 * （欄位內可以有逗號、換行，雙引號用 "" 逸出），並統一吃掉 \r，讓 CRLF／LF 都能正確斷行。
 * 刻意不用現成的 CSV 套件：格式單純、需求固定，手寫一個小型狀態機比引入依賴更好維護。
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }
    if (char === "\"") { inQuotes = true; i += 1; continue; }
    if (char === ",") { row.push(field); field = ""; i += 1; continue; }
    if (char === "\r") { i += 1; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += char; i += 1;
  }
  // 檔案結尾沒有換行符時，最後一欄／最後一行不會被上面的 \n 分支收尾，這裡補上。
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * 把教師上傳的 CSV 檔內容解析成可直接寫入題庫的題目列表。
 * 表頭辨識用欄位名稱比對（支援中英文別名，見 HEADER_ALIASES），不要求固定欄位順序；
 * 完全辨識不出表頭時，退回「難度、題目、關鍵觀念、難度說明」的固定欄位順序猜測，
 * 方便老師直接貼上最簡單的四欄資料而不必特別加表頭。
 * 每一行各自驗證、各自成功或跳過，不會因為某幾行有問題就讓整份檔案匯入失敗——
 * 回傳值同時包含成功解析的題目，以及每一行被跳過的原因，讓教師工作台能列出來對照。
 */
export function parsePracticeQuestionCsv(csvText: string, defaultDifficulty: PracticeDifficulty): PracticeQuestionImportResult {
  const rows = parseCsvRows(csvText.replace(/^\uFEFF/, "").trim());
  if (!rows.length) return { rows: [], skipped: [{ line: 1, reason: "檔案是空的。" }] };

  const headerCells = rows[0].map(cell => cell.trim().toLowerCase().replace(/\s+/g, ""));
  const columnIndex: Partial<Record<ColumnKey, number>> = {};
  headerCells.forEach((cell, index) => {
    const key = HEADER_ALIASES[cell];
    if (key && columnIndex[key] === undefined) columnIndex[key] = index;
  });
  const hasRecognizedHeader = Object.keys(columnIndex).length > 0;
  if (!hasRecognizedHeader) {
    columnIndex.difficulty = 0; columnIndex.questionText = 1; columnIndex.keyConcept = 2; columnIndex.difficultyNote = 3;
  } else if (columnIndex.questionText === undefined) {
    return { rows: [], skipped: [{ line: 1, reason: "找不到「題目」欄位，請確認表頭包含「題目」這個欄位名稱，或參考範本檔案的格式。" }] };
  }

  const dataRows = hasRecognizedHeader ? rows.slice(1) : rows;
  const startLine = hasRecognizedHeader ? 2 : 1;
  const parsedRows: ParsedPracticeQuestionRow[] = [];
  const skipped: Array<{ line: number; reason: string }> = [];

  dataRows.forEach((cells, offset) => {
    const line = startLine + offset;
    if (cells.every(cell => !cell.trim())) return; // 靜默跳過整行空白（Excel 匯出常見的多餘結尾空行）。
    if (parsedRows.length >= MAX_IMPORT_ROWS) { skipped.push({ line, reason: `已超過單次匯入上限 ${MAX_IMPORT_ROWS} 題，此行未匯入。` }); return; }

    const questionText = (cells[columnIndex.questionText!] ?? "").trim();
    if (questionText.length < 4) { skipped.push({ line, reason: "題目內容太短（至少需要 4 個字）或是空白。" }); return; }
    if (questionText.length > MAX_QUESTION_LENGTH) { skipped.push({ line, reason: `題目內容超過 ${MAX_QUESTION_LENGTH} 字上限。` }); return; }

    const rawDifficulty = columnIndex.difficulty !== undefined ? (cells[columnIndex.difficulty] ?? "").trim() : "";
    const resolvedDifficulty = rawDifficulty ? DIFFICULTY_ALIASES[rawDifficulty.toLowerCase()] : defaultDifficulty;
    if (rawDifficulty && !resolvedDifficulty) {
      skipped.push({ line, reason: `無法辨識的難度「${rawDifficulty}」，請填寫入門／基礎／進階，或留空套用目前選取的預設難度。` });
      return;
    }

    const keyConcept = (columnIndex.keyConcept !== undefined ? (cells[columnIndex.keyConcept] ?? "") : "").trim().slice(0, MAX_NOTE_LENGTH);
    const difficultyNote = (columnIndex.difficultyNote !== undefined ? (cells[columnIndex.difficultyNote] ?? "") : "").trim().slice(0, MAX_NOTE_LENGTH);

    parsedRows.push({ difficulty: resolvedDifficulty ?? defaultDifficulty, questionText, keyConcept, difficultyNote });
  });

  return { rows: parsedRows, skipped };
}
