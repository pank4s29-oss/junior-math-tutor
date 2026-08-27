export const GRADES = ["seven", "eight", "nine"] as const;
export type Grade = (typeof GRADES)[number];

export const MODES = ["guided", "step_by_step", "check"] as const;
export type TutorMode = (typeof MODES)[number];

export const CORE_UNITS: Record<Grade, Array<{ key: string; label: string }>> = {
  seven: [
    { key: "integer-number-line", label: "整數與數線" },
    { key: "exponents-scientific", label: "指數律與科學記號" },
    { key: "linear-equations", label: "一元一次方程式" },
    { key: "ratio-geometry", label: "比例與幾何" },
  ],
  eight: [
    { key: "polynomials", label: "乘法公式與多項式" },
    { key: "roots-pythagorean", label: "平方根與畢氏定理" },
    { key: "linear-functions", label: "一次函數與線型關係" },
    { key: "data-analysis", label: "資料分析" },
  ],
  nine: [
    { key: "similarity-circles", label: "相似形與圓" },
    { key: "radicals", label: "二次根式" },
    { key: "quadratic-functions", label: "二次函數" },
    { key: "probability", label: "機率" },
  ],
};

export const GRADE_LABELS: Record<Grade, string> = {
  seven: "七年級",
  eight: "八年級",
  nine: "九年級",
};

export const MODE_LABELS: Record<TutorMode, string> = {
  guided: "引導解題",
  step_by_step: "逐步教學",
  check: "驗算訂正",
};
