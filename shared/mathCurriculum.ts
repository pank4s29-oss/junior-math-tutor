export const GRADES = ["seven", "eight", "nine"] as const;
export type Grade = (typeof GRADES)[number];

export const DEFAULT_TUTOR_MODES = [
  { key: "guided", name: "引導解題", description: "先給下一步提示，不急著揭露答案。" },
  { key: "step-by-step", name: "逐步教學", description: "把推理、算式與理由完整說清楚。" },
  { key: "check", name: "驗算訂正", description: "檢查你的過程，找出第一個可修正處。" },
] as const;
export type TutorMode = string;

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

export const MODE_LABELS: Record<string, string> = Object.fromEntries(DEFAULT_TUTOR_MODES.map(mode => [mode.key, mode.name]));
