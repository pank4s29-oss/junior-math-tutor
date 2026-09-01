import { ensureLatexRendererLoaded, renderLatexSync } from "@/lib/mathRender";
import { Fragment, useEffect, useState } from "react";

/** 比對「底數^指數」，指數可以是 {大括號包住的內容} 或單一個字元／數字（含負號）。 */
const EXPONENT_PATTERN = /([A-Za-z0-9)\]])\^(\{[^{}]+\}|-?[A-Za-z0-9]+)/g;

/**
 * 純文字片段裡若出現「底數^指數」（不論是否有正確包進 $...$），一律強制用真正的
 * <sup> 上標渲染，確保次方數字顯示在原數字右上角，而不是被當成一般文字印在同一
 * 基線上（視覺上容易被誤認成靠右下）。已經在 $...$ 裡的 LaTeX 交給 MathLive 排版，
 * 這裡只處理漏網的純文字次方寫法。
 */
function renderPlainTextWithExponents(text: string, keyPrefix: string) {
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
