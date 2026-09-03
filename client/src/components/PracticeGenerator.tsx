import { Button } from "@/components/ui/button";
import { MathText } from "@/components/MathText";
import { trpc } from "@/lib/trpc";
import { PRACTICE_DIFFICULTIES, PRACTICE_DIFFICULTY_DESCRIPTIONS, PRACTICE_DIFFICULTY_LABELS, type Grade, type PracticeDifficulty, type TutorMode } from "../../../shared/mathCurriculum";
import { BookOpenCheck, Clock3, Lightbulb, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type PracticeGeneratorProps = {
  grade: Grade;
  unitKey: string;
  unitLabel: string;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  /** 學生從已生成的題目點「問提示」或「看詳解」，交回上層帶進解題區。 */
  onPractice: (question: string, mode: TutorMode, practiceQuestionId: string) => void;
};

type GeneratedPracticeQuestion = {
  id: string;
  grade: Grade;
  unitKey: string;
  unitLabel: string;
  difficulty: PracticeDifficulty;
  questionText: string;
  keyConcept: string;
  difficultyNote: string;
  status: "generated" | "sent_to_solve";
  linkedAttemptId: string | null;
  createdAt: string;
};

function difficultyBadgeClass(difficulty: PracticeDifficulty, selected: boolean) {
  if (selected) return "border-[#196b63] bg-[#eaf6f3] text-[#125d55]";
  return "border-slate-200 bg-white text-slate-500 hover:border-slate-300";
}

/** 完全獨立於解題聊天區的「請系統出題」區塊：不需要學生先提供任何題目。 */
export function PracticeGenerator({ grade, unitKey, unitLabel, isAuthenticated, onRequireAuth, onPractice }: PracticeGeneratorProps) {
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>("intro");
  const utils = trpc.useUtils();
  const questions = trpc.tutor.listPracticeQuestions.useQuery(undefined, { enabled: isAuthenticated }) as unknown as {
    data?: GeneratedPracticeQuestion[]; isLoading: boolean;
  };
  const generatePractice = trpc.tutor.generatePractice.useMutation({
    onSuccess: () => { void utils.tutor.listPracticeQuestions.invalidate(); },
    onError: error => {
      // 伺服器逾時（例如平台強制中斷連線）時，回傳的可能不是正常的 tRPC 錯誤，
      // 而是一段 HTML／純文字錯誤頁，client 端會解析 JSON 失敗，跳出很難懂的
      // 「Unexpected token 'A'...」這類訊息，這裡統一改成對學生友善的說法。
      const isParseFailure = /unexpected token|is not valid json/i.test(error.message);
      toast.error(isParseFailure ? "出題花的時間有點久，伺服器先中斷了這次請求，請再試一次。" : (error.message || "出題暫時無法使用，請稍後再試。"));
    },
  });
  const deletePracticeQuestion = trpc.tutor.deletePracticeQuestion.useMutation({
    onSuccess: () => { void utils.tutor.listPracticeQuestions.invalidate(); },
    onError: error => toast.error(error.message || "刪除失敗，請稍後再試。"),
  });

  const currentUnitQuestions = (questions.data ?? []).filter(item => item.grade === grade && item.unitKey === unitKey);
  const latest = currentUnitQuestions[0];

  const generate = () => {
    if (!isAuthenticated) { toast.message("請先登入，練習題生成才能保存到你的學習紀錄。"); onRequireAuth(); return; }
    generatePractice.mutate({ grade, unitKey, difficulty });
  };

  const removeQuestion = (practiceQuestionId: string) => {
    if (!window.confirm("確定要刪除這道練習題紀錄嗎？此動作無法復原。")) return;
    deletePracticeQuestion.mutate({ practiceQuestionId });
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
      <div className="border-b border-slate-100 bg-[#fcfdfc] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-[#196b63]"><Wand2 className="size-4" />練習題生成</div>
        <p className="mt-1 text-sm text-slate-500">不需要先給題目：選好難度，直接請系統為「{unitLabel}」出一題全新練習。</p>
        <div className="mt-4 flex gap-2">
          {PRACTICE_DIFFICULTIES.map(item => (
            <button key={item} type="button" onClick={() => setDifficulty(item)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition ${difficultyBadgeClass(item, difficulty === item)}`}>
              {PRACTICE_DIFFICULTY_LABELS[item]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-400">{PRACTICE_DIFFICULTY_DESCRIPTIONS[difficulty]}</p>
        <Button onClick={generate} disabled={generatePractice.isPending} className="mt-4 w-full rounded-full bg-[#196b63] hover:bg-[#115950] sm:w-auto sm:px-6">
          {generatePractice.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
          {latest ? "再出一題" : "請系統出一題"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        {questions.isLoading && isAuthenticated ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />正在讀取練習題紀錄…</div>
        ) : !latest ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[#f7f8f5] px-5 py-10 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#e5f3f0] text-[#196b63]"><Sparkles className="size-5" /></div>
            <p className="text-sm font-semibold text-slate-700">還沒有生成過這個單元的練習題</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">按上方「請系統出一題」，系統會直接設計一道全新題目，不需要你先輸入任何內容。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <article className="rounded-2xl border border-[#d8ebe7] bg-[#f7fcfa] p-4">
              <div className="flex items-center justify-between text-[11px] text-[#196b63]">
                <span className="rounded-full bg-white px-2 py-0.5 font-semibold ring-1 ring-[#cfe6e2]">{PRACTICE_DIFFICULTY_LABELS[latest.difficulty]}難度</span>
                <div className="flex items-center gap-3">
                  {latest.status === "sent_to_solve" && <span className="flex items-center gap-1 text-slate-400"><Clock3 className="size-3.5" />已送去解題區</span>}
                  <button type="button" onClick={() => removeQuestion(latest.id)} disabled={deletePracticeQuestion.isPending} aria-label="刪除這道練習題" className="text-slate-400 hover:text-[#9a4331] disabled:opacity-50">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800"><MathText text={latest.questionText} /></p>
              {latest.keyConcept && <p className="mt-2 text-xs leading-5 text-slate-500">關鍵觀念：<MathText text={latest.keyConcept} /></p>}
              {latest.difficultyNote && <p className="mt-1 text-xs leading-5 text-slate-400"><MathText text={latest.difficultyNote} /></p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onPractice(latest.questionText, "guided", latest.id)} className="rounded-full border-[#a7d4cd] bg-white text-xs text-[#196b63]">
                  <Lightbulb className="mr-1.5 size-3.5" />不會寫，要提示
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPractice(latest.questionText, "step-by-step", latest.id)} className="rounded-full border-[#a7d4cd] bg-white text-xs text-[#196b63]">
                  <BookOpenCheck className="mr-1.5 size-3.5" />直接看詳解
                </Button>
              </div>
            </article>

            {currentUnitQuestions.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-[0.1em] text-slate-400">這個單元先前生成的練習題</p>
                <div className="space-y-2">
                  {currentUnitQuestions.slice(1, 6).map(item => (
                    <div key={item.id} className="rounded-xl border border-slate-100 bg-[#fcfdfc] p-3">
                      <p className="line-clamp-2 text-xs leading-5 text-slate-600"><MathText text={item.questionText} /></p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{PRACTICE_DIFFICULTY_LABELS[item.difficulty]}難度</span>
                        <div className="flex items-center gap-3">
                          {item.status === "sent_to_solve" ? <span>已送去解題區</span> : (
                            <button type="button" onClick={() => onPractice(item.questionText, "guided", item.id)} className="font-semibold text-[#196b63] hover:text-[#115950]">問提示</button>
                          )}
                          <button type="button" onClick={() => removeQuestion(item.id)} disabled={deletePracticeQuestion.isPending} aria-label="刪除這道練習題" className="text-slate-400 hover:text-[#9a4331] disabled:opacity-50">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
