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

  // 修正 1：限制捕捉範圍，禁止 Regex 跨越連續兩個換行符號 (即段落)，避免 AI 漏打 $ 時將一整大段文字當成數學式
  const parts = text.split(/(\*\*[^*]+\*\*|\$\$(?:(?!\n\s*\n)[\s\S])+?\$\$|\$(?:(?!\n\s*\n)[\s\S])+?\$|\\\((?:(?!\n\s*\n)[\s\S])+?\\\)|\\[(?:(?!\n\s*\n)[\s\S])+?\\])/g);

  return <>{parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
    }

    const isMath =
      (part.startsWith("$") && part.endsWith("$")) ||
      (part.startsWith("\\(") && part.endsWith("\\)")) ||
      (part.startsWith("\\[") && part.endsWith("\\]"));

    if (isMath) {
      let latex = part;
      if (latex.startsWith("$$")) latex = latex.slice(2, -2);
      else if (latex.startsWith("$")) latex = latex.slice(1, -1);
      else if (latex.startsWith("\\(") || latex.startsWith("\\[")) latex = latex.slice(2, -2);

      const markup = renderLatexSync(latex);
      if (markup) {
        return <span key={index} className="math-inline mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: markup }} />;
      } else {
        // 修正 2：當 LaTeX 解析失敗退回純文字時，強制拔除實體換行符號，避免 AI 產生的壞掉語法撐破垂直版面
        const cleanLatex = latex
          .replace(/[\r\n]+/g, " ") 
          .replace(/\\times/g, "×")
          .replace(/\\div/g, "÷")
          .replace(/\\le/g, "≤")
          .replace(/\\ge/g, "≥");
        return <span key={index} className="font-mono text-[0.92em] text-gray-600">{renderPlainTextWithExponents(cleanLatex, `f-${index}`)}</span>;
      }
    }

    const safeText = part
      .replace(/\\times/g, "×")
      .replace(/\\div/g, "÷")
      .replace(/\\le/g, "≤")
      .replace(/\\ge/g, "≥");

    return <span key={index}>{renderPlainTextWithExponents(safeText, `p-${index}`)}</span>;
  })}</>;
}
