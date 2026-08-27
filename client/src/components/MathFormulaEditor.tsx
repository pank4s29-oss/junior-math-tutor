import { cn } from "@/lib/utils";
import { Braces, Calculator, Divide, Sigma, SquareRadical } from "lucide-react";
import { useEffect, useRef } from "react";

type MathfieldElementLike = HTMLElement & {
  value: string;
  mathVirtualKeyboardPolicy: "auto" | "manual" | "sandboxed";
  insert: (latex: string, options?: { focus?: boolean; selectionMode?: string }) => void;
};

type MathFormulaEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

const templates = [
  { label: "分數", latex: "\\frac{#0}{#?}", icon: Divide },
  { label: "根號", latex: "\\sqrt{#0}", icon: SquareRadical },
  { label: "次方", latex: "^{#0}", icon: Sigma },
  { label: "括號", latex: "\\left(#0\\right)", icon: Braces },
];

/** Visual LaTex editor with a touch keyboard for fractions, roots, powers and equations. */
export function MathFormulaEditor({ value, onChange, className, disabled }: MathFormulaEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElementLike | null>(null);

  useEffect(() => {
    if (!hostRef.current || fieldRef.current) return;
    const field = document.createElement("math-field") as MathfieldElementLike;
    field.value = value;
    field.mathVirtualKeyboardPolicy = "auto";
    field.setAttribute("aria-label", "數學公式編輯器");
    field.className = "math-formula-field";
    const handleInput = () => onChange(field.value);
    field.addEventListener("input", handleInput);
    hostRef.current.appendChild(field);
    fieldRef.current = field;
    return () => {
      field.removeEventListener("input", handleInput);
      field.remove();
      fieldRef.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    if (fieldRef.current && fieldRef.current.value !== value) fieldRef.current.value = value;
  }, [value]);

  const insert = (latex: string) => {
    if (disabled || !fieldRef.current) return;
    fieldRef.current.focus();
    fieldRef.current.insert(latex, { focus: true, selectionMode: "placeholder" });
  };

  return (
    <div className={cn("rounded-2xl border border-[#cfe5e0] bg-[#f8fcfb] p-3", className)}>
      <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-semibold text-[#196b63]"><Calculator className="size-4" />數學公式編輯器</p><span className="text-[10px] text-slate-400">輸入後會以 LaTeX 傳送</span></div>
      <div ref={hostRef} className="formula-host rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-inner" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {templates.map(template => { const Icon = template.icon; return <button key={template.label} disabled={disabled} onClick={() => insert(template.latex)} type="button" className="flex items-center gap-1 rounded-lg border border-[#dcebe8] bg-white px-2.5 py-1.5 text-xs text-[#196b63] transition hover:bg-[#eaf6f3] disabled:cursor-not-allowed disabled:opacity-50"><Icon className="size-3.5" />{template.label}</button>; })}
        <button disabled={disabled} onClick={() => insert("=")} type="button" className="rounded-lg border border-[#dcebe8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#196b63] transition hover:bg-[#eaf6f3] disabled:cursor-not-allowed disabled:opacity-50">＝</button>
        <button disabled={disabled} onClick={() => insert("\\pi")} type="button" className="rounded-lg border border-[#dcebe8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#196b63] transition hover:bg-[#eaf6f3] disabled:cursor-not-allowed disabled:opacity-50">π</button>
      </div>
    </div>
  );
}
