import { ensureLatexRendererLoaded, renderLatexSync } from "@/lib/mathRender";
import { useEffect, useState } from "react";

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
        : <span key={index} className="font-mono text-[0.92em]">{latex}</span>;
    }
    return <span key={index}>{part}</span>;
  })}</>;
}
