import { ensureLatexRendererLoaded, renderLatexSync } from "@/lib/mathRender";
import { Fragment, useEffect, useState } from "react";

/** 比對「底數^指數」，指數可以是 {大括號包住的內容} 或單一個字元／數字（含負號）。 */
const EXPONENT_PATTERN = /([A-Za-z0-9)\]])\^(\{[^{}]+\}|-?[A-Za-z0-9]+)/g;

/**
 * MathLive 尚未載入完成（或載入失敗）時，$...$ 裡的原始 LaTeX 巨集必須先轉成
 * 看得懂的符號，不能整串原始語法印出來，例如 `\times`、`\cdot`、`\le`。這裡只
 * 覆蓋科學記號與國中常見算式會用到的巨集，且都是安全的一對一符號替換。
 */
const LATEX_MACRO_MAP: Array<[RegExp, string]> = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm/g, "±"],
  [/\\mp/g, "∓"],
  [/\\leq|\\le\b/g, "≤"],
  [/\\geq|\\ge\b/g, "≥"],
  [/\\neq|\\ne\b/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\sqrt\{([^{}]+)\}/g, "√($1)"],
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)"],
  [/\\left|\\right/g, ""],
  [/\\,|\\;|\\:|\\!/g, ""],
  [/\\text\{([^{}]*)\}/g, "$1"],
];

/** 把殘留、上面沒對到的未知巨集（`\某字串`）的反斜線去掉，避免直接把原始語法印給學生看。 */
const UNKNOWN_MACRO_PATTERN = /\\([a-zA-Z]+)/g;

function normalizeLooseLatexMacros(text: string) {
  let result = text;
  for (const [pattern, replacement] of LATEX_MACRO_MAP) result = result.replace(pattern, replacement);
  return result.replace(UNKNOWN_MACRO_PATTERN, "$1");
}

/**
 * 純文字片段裡若出現「底數^指數」（不論是否有正確包進 $...$），一律強制用真正的
 * <sup> 上標渲染，確保次方數字顯示在原數字右上角，而不是被當成一般文字印在同一
 * 基線上（視覺上容易被誤認成靠右下）。已經在 $...$ 裡的 LaTeX 交給 MathLive 排版，
 * 這裡只處理漏網的純文字次方寫法，並在套用上標前先把 \times 之類的巨集轉成符號，
 * 確保 MathLive 還沒載入完成時，科學記號也能正確顯示成「a × 10 的上標 n」。
 */
function renderPlainTextWithExponents(rawText: string, keyPrefix: string) {
  const text = normalizeLooseLatexMacros(rawText);
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchIndex = 0;
  EXPONENT_PATTERN.lastIndex = 0;
  while ((match = EXPONENT_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(<Fragment key={`${keyPrefix}-t${matchIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    const base = match[1];
    const exponent = match[2].startsWith("{") ? match[2].slice(1, -1) : match[2];
    nodes.push(<Fragment key={`${keyPrefix}-e${matchIndex}`}>{base}<sup>{exponent}</sup></Fragment>);
    lastIndex = match.index + match[0].length;
    matchIndex += 1;
  }
  if (lastIndex < text.length) nodes.push(<Fragment key={`${keyPrefix}-t${matchIndex}`}>{text.slice(lastIndex)}</Fragment>);
  return nodes;
}

/**
 * 解題與出題系統的文字裡，數學式一律用 `$...$` 的 LaTeX 行內語法標記
 * （見 buildTutorInstructions／buildPracticeGenerationInstructions）。這個元件把
 * 這些片段實際排版成學生看得懂的數學式，而不是把 `$a \times b < 0$`
 * 這種原始語法字串原封不動印出來；`**粗體**` 則沿用既有的簡易 markdown 處理。
 */
export function MathText({ text }: { text: string }) {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    ensureLatexRendererLoaded(() => forceRerender(value => value + 1));
  }, []);

  const parts = text.split(/(\*\*[^*]+\*\*|\$[^$\n]+\$)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      const latex = part.slice(1, -1);
      const markup = renderLatexSync(latex);
      return markup
        ? <span key={index} className="math-inline mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: markup }} />
        : <span key={index} className="font-mono text-[0.92em]">{renderPlainTextWithExponents(latex, `f-${index}`)}</span>;
    }
    return <span key={index}>{renderPlainTextWithExponents(part, `p-${index}`)}</span>;
  })}</>;
}
