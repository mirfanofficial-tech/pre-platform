"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Flag, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api";
import {
  addBookmark,
  checkAnswer,
  clockOffset,
  getAttempt,
  listBookmarks,
  removeBookmark,
  saveAnswers,
  startPractice,
  submitAttempt,
  type AttemptResult,
  type AttemptState,
  type Bookmark as BookmarkRow,
  type Check,
} from "@/lib/exam";
import { cn } from "@/lib/utils";
import { Legend, OptionButton, Palette, formatClock, letters, type PaletteStatus } from "./palette";

const BOOKMARKS_KEY = ["bookmarks"] as const;

// Used only from click handlers; a fresh value makes the URL start a brand-new practice set.
const freshNonce = () => String(Date.now());

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="max-w-[460px] text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">{body}</p>
        <div className="mt-5 flex justify-center gap-3">{action}</div>
      </Card>
    </div>
  );
}

export function PracticeRunner() {
  const params = useSearchParams();
  const router = useRouter();
  const attemptId = params.get("attempt");
  const exam = params.get("exam") ?? "lat";
  const subject = params.get("subject");
  const mode = params.get("mode") === "test" ? "test" : "practice";
  const nonce = params.get("n") ?? "";
  const creating = useRef<string | null>(null);
  const [createError, setCreateError] = useState<Error | null>(null);

  useEffect(() => {
    if (attemptId) return;
    const key = `${exam}|${subject}|${mode}|${nonce}`;
    if (creating.current === key) return;
    creating.current = key;
    startPractice({ exam, subject_id: subject ?? undefined, count: 10, mode })
      .then((s) => {
        const q = new URLSearchParams({ attempt: s.id, exam, mode });
        if (subject) q.set("subject", subject);
        router.replace(`/practice/session?${q}`);
      })
      .catch((e: Error) => setCreateError(e));
  }, [attemptId, exam, subject, mode, nonce, router]);

  const attempt = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => getAttempt(attemptId!),
    enabled: !!attemptId,
    staleTime: Infinity,
    gcTime: 0,
    retry: (count, e) => !(e instanceof ApiError) && count < 2,
  });

  useEffect(() => {
    if (attempt.data && attempt.data.status !== "in_progress") router.replace(`/attempts/${attempt.data.id}/result`);
  }, [attempt.data, router]);

  const failure = createError ?? (attempt.error as Error | null);
  if (failure) {
    const empty = failure instanceof ApiError && failure.code === "no_questions";
    const upgrade = failure instanceof ApiError && failure.code === "limit_reached";
    return (
      <Message
        title={empty ? "No questions yet" : upgrade ? "Monthly limit reached" : "Could not start practice"}
        body={
          failure instanceof ApiError
            ? (failure.problem.detail ?? failure.problem.title)
            : "Check your connection and try again."
        }
        action={
          <>
            <ButtonLink href="/practice" variant="secondary">
              Back to practice
            </ButtonLink>
            {upgrade && <ButtonLink href="/pricing">See Premium plans</ButtonLink>}
            {!empty && !upgrade && (
              <Button
                onClick={() => {
                  setCreateError(null);
                  creating.current = null;
                  router.replace(`/practice/session?exam=${exam}&n=${freshNonce()}`);
                }}
              >
                Try again
              </Button>
            )}
          </>
        }
      />
    );
  }
  if (!attempt.data || attempt.data.status !== "in_progress") {
    return <div className="grid min-h-screen place-items-center text-ink-3">Preparing your questions…</div>;
  }
  return <Session key={attempt.data.id} state={attempt.data} exam={exam} subject={subject} />;
}

function Session({ state, exam, subject }: { state: AttemptState; exam: string; subject: string | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const questions = state.questions;
  const total = questions.length;
  const mode = state.mode;
  const [offset] = useState(() => clockOffset(state.server_now));

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.answers.filter((a) => a.selected_option_id).map((a) => [a.question_id, a.selected_option_id!])),
  );
  const [feedback, setFeedback] = useState<Record<string, Check>>(() =>
    Object.fromEntries(state.answers.filter((a) => a.feedback).map((a) => [a.question_id, a.feedback!])),
  );
  const [marked, setMarked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(state.answers.filter((a) => a.marked_for_review).map((a) => [a.question_id, true])),
  );
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true });
  const [elapsed, setElapsed] = useState(0);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState("");
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const bookmarks = useQuery({ queryKey: BOOKMARKS_KEY, queryFn: listBookmarks, staleTime: 60_000 });
  const saved = new Set((bookmarks.data ?? []).map((b) => b.question_id));

  useEffect(() => {
    if (result) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() + offset - Date.parse(state.started_at)) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.started_at, offset, result]);

  const q = questions[current];
  const verdict = feedback[q.id];
  const reveal = mode === "practice" && !!verdict;
  const correct = Object.values(feedback).filter((f) => f.correct).length;
  const incorrect = Object.values(feedback).filter((f) => !f.correct).length;
  const answeredCount = Object.keys(answers).length;
  const markedCount = Object.values(marked).filter(Boolean).length;
  const correctLetter = verdict ? letters[q.options.findIndex((o) => o.id === verdict.correct_option_id)] : "";

  const go = (i: number) => {
    setCurrent(i);
    setVisited((v) => ({ ...v, [i]: true }));
  };

  const status = (i: number): PaletteStatus => {
    const id = questions[i].id;
    if (i === current) return "current";
    if (marked[id]) return "marked";
    if (answers[id]) {
      if (mode === "test") return "answered";
      return feedback[id]?.correct ? "correct" : "incorrect";
    }
    return visited[i] ? "visited" : "unvisited";
  };

  const reportFailure = (e: unknown) =>
    setProblem(
      e instanceof ApiError
        ? e.code === "limit_reached"
          ? (e.problem.detail ?? e.problem.title)
          : e.problem.title
        : "Could not reach the server. Try again.",
    );

  const choose = async (optionId: string) => {
    setProblem("");
    if (mode === "practice") {
      if (feedback[q.id] || checking) return;
      setChecking(true);
      try {
        const verdictNow = await checkAnswer(state.id, q.id, optionId);
        setAnswers((a) => ({ ...a, [q.id]: optionId }));
        setFeedback((f) => ({ ...f, [q.id]: verdictNow }));
      } catch (e) {
        reportFailure(e);
      } finally {
        setChecking(false);
      }
    } else {
      setAnswers((a) => ({ ...a, [q.id]: optionId }));
      saveAnswers(state.id, [{ question_id: q.id, selected_option_id: optionId }]).catch(reportFailure);
    }
  };

  const toggleMark = () => {
    const value = !marked[q.id];
    setMarked((m) => ({ ...m, [q.id]: value }));
    saveAnswers(state.id, [{ question_id: q.id, marked_for_review: value }]).catch(reportFailure);
  };

  const toggleBookmark = () => {
    const isSaved = saved.has(q.id);
    client.setQueryData<BookmarkRow[]>(BOOKMARKS_KEY, (rows = []) =>
      isSaved
        ? rows.filter((b) => b.question_id !== q.id)
        : [...rows, { question_id: q.id, text: q.text, section: q.section, topic: q.topic, saved_at: "" }],
    );
    (isSaved ? removeBookmark(q.id) : addBookmark(q.id)).catch((e) => {
      void client.invalidateQueries({ queryKey: BOOKMARKS_KEY });
      reportFailure(e);
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setProblem("");
    try {
      setResult(await submitAttempt(state.id));
    } catch (e) {
      reportFailure(e);
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: "practice" | "test") => {
    const p = new URLSearchParams({ exam, mode: m, n: freshNonce() });
    if (subject) p.set("subject", subject);
    router.push(`/practice/session?${p}`);
  };

  const again = () => {
    const p = new URLSearchParams({ exam, mode, n: freshNonce() });
    if (subject) p.set("subject", subject);
    router.push(`/practice/session?${p}`);
  };

  const nextUnanswered = questions.findIndex((x) => !answers[x.id]);
  const bookmarkIcon = saved.has(q.id) ? <BookmarkCheck size={16} className="text-brand-600" /> : <Bookmark size={16} />;

  return (
    <div className="min-h-screen bg-surface-subtle pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Link href="/practice" aria-label="Back to practice" className="grid size-9 place-items-center rounded-md border border-line lg:hidden">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs font-semibold text-brand-700">{state.title}</p>
            <p className="text-sm font-bold">
              <span className="hidden lg:inline">Practice set · {total} questions</span>
              <span className="lg:hidden">
                Question {current + 1} of {total}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 lg:hidden">
          <Button variant="secondary" size="sm" className="size-9 px-0" aria-label={saved.has(q.id) ? "Remove bookmark" : "Bookmark question"} onClick={toggleBookmark}>
            {bookmarkIcon}
          </Button>
          <Button variant="secondary" size="sm" className="size-9 px-0" aria-label="Mark for review" onClick={toggleMark}>
            <Flag size={16} className={marked[q.id] ? "text-warning" : ""} />
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-surface-neutral p-1" role="group" aria-label="Mode">
          {(["practice", "test"] as const).map((m) => (
            <button
              key={m}
              onClick={() => m !== mode && switchMode(m)}
              disabled={m !== mode && answeredCount > 0}
              title={m !== mode && answeredCount > 0 ? "Start a new set to change mode" : undefined}
              aria-pressed={mode === m}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                mode === m ? "bg-white shadow-sm" : "text-ink-3",
              )}
            >
              {m === "practice" ? "Practice mode" : "Test mode"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 max-lg:w-full">
          <Badge tone="neutral">{formatClock(elapsed)} elapsed</Badge>
          {mode === "practice" && (
            <>
              <Badge>{correct} correct</Badge>
              <Badge tone="danger">{incorrect} incorrect</Badge>
            </>
          )}
        </div>
        <div className="-mx-4 -mb-3 h-1 w-[calc(100%+2rem)] bg-surface-neutral lg:hidden">
          <div className="h-full bg-brand-600" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1200px] gap-6 p-4 lg:grid-cols-[1fr_300px] lg:p-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5 lg:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold">
                  Question {current + 1} of {total}
                </span>
                <Badge tone={q.difficulty === "easy" ? "brand" : "warning"} className="capitalize">
                  {q.difficulty}
                </Badge>
                <span className="text-xs text-ink-3">{q.section}</span>
              </div>
              <div className="flex gap-2 max-lg:hidden">
                <Button variant="ghost" size="sm" onClick={toggleBookmark}>
                  {bookmarkIcon}
                  {saved.has(q.id) ? "Bookmarked" : "Bookmark"}
                </Button>
                <Button variant="ghost" size="sm" onClick={toggleMark}>
                  <Flag size={16} className={marked[q.id] ? "text-warning" : ""} /> Mark for review
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-line text-[17px] leading-relaxed">{q.text}</p>
            <div className="mt-6 flex flex-col gap-3">
              {q.options.map((opt, i) => {
                let state: "idle" | "selected" | "correct" | "incorrect" = "idle";
                if (reveal && verdict) {
                  if (opt.id === verdict.correct_option_id) state = "correct";
                  else if (answers[q.id] === opt.id) state = "incorrect";
                } else if (answers[q.id] === opt.id) state = "selected";
                return (
                  <OptionButton
                    key={opt.id}
                    letter={letters[i]}
                    text={opt.text}
                    state={state}
                    disabled={reveal || checking}
                    onClick={() => void choose(opt.id)}
                  />
                );
              })}
            </div>
            {problem && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {problem}
              </p>
            )}
          </Card>

          {reveal && verdict && (
            <Card className="border-brand-100 bg-brand-50">
              <p className="font-bold text-brand-800">
                {verdict.correct ? "Correct" : "Not quite"} — correct answer: {correctLetter}
              </p>
              {q.topic && <p className="mt-0.5 text-xs text-ink-3">Related topic: {q.topic}</p>}
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{verdict.explanation}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-3">Explanations are written by subject teachers for practice purposes.</p>
                <Button variant="secondary" size="sm" disabled={nextUnanswered === -1} onClick={() => go(nextUnanswered)}>
                  Try another question
                </Button>
              </div>
            </Card>
          )}

          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-line bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <Button variant="secondary" className="max-lg:size-11 max-lg:px-0" aria-label="Previous question" disabled={current === 0} onClick={() => go(current - 1)}>
              <ArrowLeft size={18} className="lg:hidden" />
              <span className="hidden lg:inline">Previous</span>
            </Button>
            <Button variant="secondary" className="size-11 px-0 lg:hidden" aria-label="Open question palette" onClick={() => setSheet(true)}>
              <LayoutGrid size={18} />
            </Button>
            <div className="flex flex-1 justify-end gap-2 lg:flex-none lg:gap-3">
              <Button variant="secondary" className="max-lg:h-11 max-lg:px-3" onClick={() => setConfirm(true)}>
                <span className="sm:hidden">Submit</span>
                <span className="hidden sm:inline">Submit practice</span>
              </Button>
              <Button className="max-lg:h-11 max-lg:flex-1" disabled={current === total - 1} onClick={() => go(current + 1)}>
                Next question
              </Button>
            </div>
          </div>
        </div>

        <Card className="hidden h-fit p-5 lg:sticky lg:top-24 lg:block">
          <h2 className="font-bold">Question palette</h2>
          <p className="mb-4 text-xs text-ink-3">{total} questions</p>
          <Palette count={total} status={status} onSelect={go} />
          <div className="mt-5">
            <Legend
              items={[
                [mode === "test" ? "answered" : "correct", mode === "test" ? "Answered" : "Correct"],
                ...(mode === "practice" ? ([["incorrect", "Incorrect"]] as [PaletteStatus, string][]) : []),
                ["marked", "Marked for review"],
                ["current", "Current question"],
                ["unvisited", "Not visited"],
              ]}
            />
          </div>
          <dl className="mt-5 grid gap-1.5 border-t border-line pt-4 text-[13px]">
            {[
              ["Answered", `${answeredCount} of ${total}`],
              ["Marked for review", markedCount],
              ["Not visited", total - Object.keys(visited).length],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between">
                <dt className="text-ink-3">{l}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title="Question palette">
        <div className="mt-4">
          <Palette
            count={total}
            status={status}
            onSelect={(i) => {
              go(i);
              setSheet(false);
            }}
          />
        </div>
      </Modal>

      <Modal open={confirm} onClose={() => !submitting && !result && setConfirm(false)} title={result ? "Practice complete" : "Submit practice set"}>
        {result ? (
          <>
            <p className="mt-3 text-ink-2">
              You scored <strong>{result.correct}</strong> out of {result.total} ({result.percent}%).
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <ButtonLink href={`/attempts/${result.id}/review`} variant="secondary">
                Review answers
              </ButtonLink>
              <ButtonLink href="/exams/lat" variant="secondary">
                Back to LAT
              </ButtonLink>
              <Button onClick={again}>Try again</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-ink-2">
              {answeredCount} answered · {total - answeredCount} unanswered · {markedCount} marked for review.
              {mode === "practice" && " In practice mode you see the answer immediately. Switch to test mode to hide feedback until you submit."}
            </p>
            {problem && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {problem}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" disabled={submitting} onClick={() => setConfirm(false)}>
                Keep practising
              </Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Submitting…" : "Submit practice"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
