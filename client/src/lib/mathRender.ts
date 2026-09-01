type ConvertLatexToMarkup = (latex: string, options?: Record<string, unknown>) => string;

const MATHLIVE_MODULE_URL = "https://unpkg.com/mathlive@0.110.0/mathlive.min.mjs";

let cachedConvert: ConvertLatexToMarkup | null = null;
let loadingPromise: Promise<ConvertLatexToMarkup> | null = null;

/**
 * index.html 已經用 <script type="module"> 載入同一支 MathLive（供公式編輯器的
 * <math-field> 使用）。用完全相同的絕對網址動態 import，瀏覽器的模組快取
 * 會直接命中同一個模組實例，不會重新下載或重新執行，也不需要再多裝一個套件。
 */
function loadConvertLatexToMarkup() {
  if (cachedConvert) return Promise.resolve(cachedConvert);
  if (!loadingPromise) {
    loadingPromise = import(/* @vite-ignore */ MATHLIVE_MODULE_URL).then((mod: { convertLatexToMarkup: ConvertLatexToMarkup }) => {
      cachedConvert = mod.convertLatexToMarkup;
      return cachedConvert;
    });
  }
  return loadingPromise;
}

/** 尚未載入完成前回傳 null，呼叫端應保留原始文字作為過渡狀態的 fallback。 */
export function renderLatexSync(latex: string): string | null {
  if (!cachedConvert) return null;
  try {
    return cachedConvert(latex, { letterShapeStyle: "tex" });
  } catch {
    return null;
  }
}

export function ensureLatexRendererLoaded(onReady: () => void) {
  if (cachedConvert) { onReady(); return; }
  void loadConvertLatexToMarkup().then(() => onReady()).catch(() => { /* 保留原始文字 fallback，不阻擋畫面。 */ });
}
