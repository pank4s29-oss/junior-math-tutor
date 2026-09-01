import { ensureLatexRendererLoaded, renderLatexSync } from "@/lib/mathRender";
import { Fragment, useEffect, useState } from "react";

const EXPONENT_PATTERN = /([A-Za-z0-9)\]])\^(\{[^{}]+\}|-?[A-Za-z0-9]+)/g;

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

export function MathText({ text }: { text: string }) {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    ensureLatexRendererLoaded(() => forceRerender(value => value + 1));
  }, []);

  // 修正 1：擴展 Regex，支援 \n 存在於 $ 內部，且支援 $$..$$, \(..\), \[..\]
  const parts = text.split(/(\*\*[^*]+\*\*|\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\\([\s\S]+?\\\)|\\[[\s\S]+?\\])/g);

  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
    }

    // 判斷是否為捕捉到的 LaTeX 區塊
    const isMath =
      (part.startsWith("$") && part.endsWith("$")) ||
      (part.startsWith("\\(") && part.endsWith("\\)")) ||
      (part.startsWith("\\[") && part.endsWith("\\]"));

    if (isMath) {
      // 修正 2：根據不同的標記，動態剝離外層符號
      let latex = part;
      if (latex.startsWith("$$")) latex = latex.slice(2, -2);
      else if (latex.startsWith("$")) latex = latex.slice(1, -1);
      else if (latex.startsWith("\\(") || latex.startsWith("\\[")) latex = latex.slice(2, -2);

      const markup = renderLatexSync(latex);
      return markup
        ? <span key={index} className="math-inline mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: markup }} />
        : <span key={index} className="font-mono text-[0.92em]">{renderPlainTextWithExponents(latex, `f-${index}`)}</span>;
    }

    // 修正 3：漏網純文字的防呆處理 (若 LLM 完全忘記加標記)
    // 替換掉會引發版面錯亂的常見未轉義 LaTeX 符號
    const safeText = part
      .replace(/\\times/g, "×")
      .replace(/\\div/g, "÷")
      .replace(/\\le/g, "≤")
      .replace(/\\ge/g, "≥");

    return <span key={index}>{renderPlainTextWithExponents(safeText, `p-${index}`)}</span>;
  })}</>;
}
