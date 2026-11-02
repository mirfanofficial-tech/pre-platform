"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, Flag, Timer, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api";
import {
  clockOffset,
  saveAnswers,
  secondsLeft,
  startMock,
  submitAttempt,
  type AnswerIn,
  type AttemptState,
} from "@/lib/exam";
import { cn } from "@/lib/utils";
import { Legend, OptionButton, Palette, formatClock, letters, paletteStyles, type PaletteStatus } from "./palette";

type Loaded = { state: AttemptState; offset: number };

export function MockRunner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    if (startedFor.current === attempt) return;
    startedFor.current = attempt;
    startMock(id)
      .then((state) => {
        if (state.status !== "in_progress") router.replace(`/attempts/${state.id}/result`);
        else setLoaded({ state, offset: clockOffset(state.server_now) });
      })
      .catch((e: Error) => setError(e));
  }, [id, attempt, router]);

  if (error) {
    const code = error instanceof ApiError ? error.code : "";
    const upgrade = code === "limit_reached" || code === "premium_required";
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-[460px] text-center">
          <h1 className="text-lg font-bold">
            {code === "email_not_verified"
              ? "Confirm your email first"
              : code === "not_found"
                ? "Mock test not found"
                : upgrade
                  ? (error as ApiError).problem.title
                  : "Could not start the mock test"}
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            {code === "email_not_verified"
              ? "Mock tests unlock once your email address is confirmed. Use the banner on your dashboard to resend the link."
              : code === "not_found"
                ? "This test is not available."
                : error instanceof ApiError
                  ? (error.problem.detail ?? error.problem.title)
                  : "Check your connection and try again."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <ButtonLink href={code === "email_not_verified" ? "/dashboard" : "/mock-tests"} variant="secondary">
              {code === "email_not_verified" ? "Go to dashboard" : "All mock tests"}
            </ButtonLink>
            {upgrade && <ButtonLink href="/pricing">See Premium plans</ButtonLink>}
            {code !== "email_not_verified" && code !== "not_found" && !upgrade && (
              <Button
                onClick={() => {
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }
  if (!loaded) return <div className="grid min-h-screen place-items-center text-ink-3">Loading paper…</div>;
  return <Paper state={loaded.state} offset={loaded.offset} />;
}

function Paper({ state, offset }: { state: AttemptState; offset: number }) {
  const router = useRouter();
  const questions = state.questions;
  const total = questions.length;

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(state.answers.filter((a) => a.selected_option_id).map((a) => [a.question_id, a.selected_option_id])),
  );
  const [marked, setMarked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(state.answers.filter((a) => a.marked_for_review).map((a) => [a.question_id, true])),
  );
  const [visited, setVisited] = useState<Record<number, boolean>>(() => {
    const touched = new Set(state.answers.filter((a) => a.selected_option_id || a.marked_for_review).map((a) => a.question_id));
    const v: Record<number, boolean> = { 0: true };
    questions.forEach((q, i) => touched.has(q.id) && (v[i] = true));
    return v;
  });
  const [confirm, setConfirm] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"ok" | "saving" | "error">("ok");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const pending = useRef(new Map<string, AnswerIn>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const finishing = useRef(false);

  const doFlush = async () => {
    if (pending.current.size === 0) return;
    const batch = [...pending.current.entries()];
    setSaveState("saving");
    try {
      await saveAnswers(state.id, batch.map(([, item]) => item));
      for (const [key, item] of batch) if (pending.current.get(key) === item) pending.current.delete(key);
      setSaveState(pending.current.size ? "saving" : "ok");
    } catch (e) {
      if (e instanceof ApiError && e.code === "attempt_closed") {
        router.replace(`/attempts/${state.id}/result`);
        return;
      }
      setSaveState("error");
    }
  };
  const flush = () => (chain.current = chain.current.then(doFlush));

  const queue = (item: AnswerIn) => {
    const prev = pending.current.get(item.question_id);
    const merged: AnswerIn = { ...prev, ...item };
    if (item.clear) delete merged.selected_option_id;
    else if (item.selected_option_id) merged.clear = false;
    pending.current.set(item.question_id, merged);
    void flush();
  };

  useEffect(() => {
    const t = setInterval(() => pending.current.size && void flush(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const tick = () => {
      const left = secondsLeft(state.deadline_at, offset);
      setRemaining(left);
      if (left === 0) void finishRef.current();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.deadline_at, offset]);

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await flush();
      const result = await submitAttempt(state.id);
      router.push(`/attempts/${result.id}/result`);
    } catch (e) {
      finishing.current = false;
      setSubmitting(false);
      setSubmitError(e instanceof ApiError ? e.problem.title : "Could not reach the server. Try submitting again.");
    }
  };

  useEffect(() => {
    finishRef.current = finish;
  });

  const q = questions[current];
  const answered = Object.values(answers).filter(Boolean).length;
  const unanswered = total - answered;
  const markedCount = Object.values(marked).filter(Boolean).length;
  const low = remaining !== null && remaining < 300;
  const minutes = state.deadline_at ? Math.round((Date.parse(state.deadline_at) - Date.parse(state.started_at)) / 60000) : 0;

  const goto = (i: number) => {
    setCurrent(i);
    setVisited((v) => ({ ...v, [i]: true }));
  };
  const choose = (optionId: string) => {
    setAnswers((a) => ({ ...a, [q.id]: optionId }));
    queue({ question_id: q.id, selected_option_id: optionId });
  };
  const clearAnswer = () => {
    setAnswers((a) => ({ ...a, [q.id]: null }));
    queue({ question_id: q.id, clear: true });
  };
  const toggleMark = () => {
    const value = !marked[q.id];
    setMarked((m) => ({ ...m, [q.id]: value }));
    queue({ question_id: q.id, marked_for_review: value });
  };
  const next = () => goto(Math.min(current + 1, total - 1));

  const status = (i: number): PaletteStatus => {
    const id = questions[i].id;
    if (i === current) return "current";
    if (marked[id]) return "marked";
    if (answers[id]) return "answered";
    return visited[i] ? "visited" : "unvisited";
  };
  const visitedNotAnswered = Object.keys(visited).filter((i) => !answers[questions[+i].id]).length;

  return (
    <div className="min-h-screen bg-surface-subtle pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-wrap lg:px-6">
          <div>
            <p className="font-bold">{state.title}</p>
            <p className="hidden text-xs text-ink-3 lg:block">
              {total} questions · {minutes} minutes · Test mode (answers hidden until submission)
            </p>
            <p className="text-xs text-ink-3 lg:hidden">
              Question {current + 1} of {total} · Test mode
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className={cn("flex items-center gap-2 rounded-md px-3 py-1.5", low ? "bg-danger-bg text-danger" : "bg-brand-50 text-brand-800")}>
              <Timer size={18} />
              <span className="text-xl font-extrabold tabular-nums" aria-live="off">
                {remaining === null ? "--:--" : formatClock(remaining)}
              </span>
              <span className="hidden text-xs lg:inline">remaining</span>
            </div>
            <div className="hidden gap-4 text-center text-xs text-ink-3 lg:flex">
              <div>
                <p className="text-base font-bold text-ink">{answered}</p>Answered
              </div>
              <div>
                <p className="text-base font-bold text-ink">{unanswered}</p>Remaining
              </div>
            </div>
            <Button variant="danger" className="hidden lg:inline-flex" onClick={() => setConfirm(true)}>
              Submit exam
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-3 text-center text-xs lg:hidden">
          {[
            [answered, "Answered", "bg-brand-50 text-brand-800"],
            [unanswered, "Unanswered", "bg-surface-neutral text-ink-2"],
            [markedCount, "For review", "bg-warning-bg text-amber-800"],
          ].map(([v, l, tone]) => (
            <div key={l as string} className={cn("rounded-md px-2 py-1.5 font-semibold", tone as string)}>
              {v} {l}
            </div>
          ))}
        </div>
        <div className="h-1 bg-surface-neutral">
          <div className="h-full bg-brand-600" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
        {saveState === "error" && (
          <p role="alert" className="flex items-center justify-center gap-2 bg-danger-bg px-6 py-2 text-center text-[13px] font-medium text-danger">
            <WifiOff size={14} /> Connection problem — your latest answers are not saved yet. We keep retrying.
          </p>
        )}
        {low && (
          <p className="bg-warning-bg px-6 py-2 text-center text-[13px] font-medium text-amber-800">
            Less than 5 minutes remaining — unanswered questions will be submitted as blank.
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-[1200px] gap-6 p-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5 lg:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-brand-700">Section · {q.section}</p>
                <p className="font-bold">
                  Question {current + 1} of {total}
                </p>
              </div>
              {marked[q.id] && (
                <Badge tone="warning" className="max-lg:hidden">
                  <Flag size={12} /> Marked for review
                </Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                className={cn("lg:hidden", marked[q.id] && "border-warning bg-warning-bg text-amber-800")}
                onClick={toggleMark}
              >
                <Flag size={14} /> {marked[q.id] ? "Marked" : "Review"}
              </Button>
            </div>
            <p className="whitespace-pre-line text-[17px] leading-relaxed">{q.text}</p>
            <div className="mt-6 flex flex-col gap-3">
              {q.options.map((opt, i) => (
                <OptionButton
                  key={opt.id}
                  letter={letters[i]}
                  text={opt.text}
                  state={answers[q.id] === opt.id ? "selected" : "idle"}
                  onClick={() => choose(opt.id)}
                />
              ))}
            </div>
            <Button variant="secondary" className="mt-4 w-full lg:hidden" onClick={clearAnswer}>
              Clear response
            </Button>
          </Card>
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-line bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <Button
              variant="secondary"
              className="max-lg:size-11 max-lg:px-0"
              aria-label="Previous question"
              disabled={current === 0}
              onClick={() => goto(current - 1)}
            >
              <ArrowLeft size={18} className="lg:hidden" />
              <span className="hidden lg:inline">Previous</span>
            </Button>
            <div className="flex flex-1 justify-end gap-2 lg:flex-none lg:gap-3">
              <Button variant="ghost" className="hidden lg:inline-flex" onClick={clearAnswer}>
                Clear response
              </Button>
              <Button variant="secondary" className="hidden lg:inline-flex" onClick={toggleMark}>
                <Flag size={16} className={marked[q.id] ? "text-warning" : ""} />
                {marked[q.id] ? "Unmark" : "Mark for review"}
              </Button>
              <Button
                variant="secondary"
                className="border-danger text-danger hover:bg-danger-bg max-lg:h-11 lg:hidden"
                onClick={() => setConfirm(true)}
              >
                Submit
              </Button>
              <Button className="max-lg:h-11 max-lg:flex-1" onClick={next}>
                <span className="lg:hidden">Save &amp; next</span>
                <span className="hidden lg:inline">Save and next</span>
              </Button>
            </div>
          </div>
        </div>

        <Card className="h-fit min-w-0 p-5 lg:sticky lg:top-28">
          <button
            className="flex w-full items-center justify-between lg:cursor-default"
            aria-expanded={paletteOpen}
            onClick={() => setPaletteOpen((o) => !o)}
          >
            <span className="text-left">
              <span className="block font-bold">Question palette</span>
              <span className="text-xs font-normal text-ink-3 max-lg:hidden">All sections</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-brand-700 lg:hidden">
              {paletteOpen ? "Collapse" : "Tap to expand"}
              <ChevronDown size={14} className={paletteOpen ? "rotate-180" : ""} />
            </span>
          </button>
          {!paletteOpen && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {questions.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Question ${i + 1}`}
                  onClick={() => goto(i)}
                  className={cn("grid size-9 shrink-0 place-items-center rounded-md border text-[13px] font-semibold", paletteStyles[status(i)])}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className={cn("mt-4", !paletteOpen && "max-lg:hidden")}>
            <Palette count={total} status={status} onSelect={goto} />
          </div>
          <div className={cn("mt-5", !paletteOpen && "max-lg:hidden")}>
            <Legend
              items={[
                ["answered", "Answered", answered],
                ["visited", "Visited, not answered", visitedNotAnswered],
                ["marked", "Marked for review", markedCount],
                ["unvisited", "Not visited", total - Object.keys(visited).length],
              ]}
            />
          </div>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => !submitting && setConfirm(false)} title={`Submit ${state.title}?`} icon={<AlertTriangle size={22} />}>
        <p className="mt-3 text-sm text-ink-2">
          Once submitted you cannot return to this paper. Your score and subject-wise analysis will be available
          straight away.
        </p>
        <div className="my-5 grid grid-cols-3 gap-3 text-center">
          {[
            [answered, "Answered"],
            [unanswered, "Unanswered"],
            [markedCount, "Marked for review"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-md bg-surface-subtle p-3">
              <p className="text-2xl font-extrabold">{v}</p>
              <p className="text-xs text-ink-3">{l}</p>
            </div>
          ))}
        </div>
        <p className={cn("rounded-md px-3 py-2 text-xs", low ? "bg-danger-bg text-danger" : "text-ink-3")}>
          {remaining === null ? "" : `${formatClock(remaining)} remaining — `}the paper submits automatically when time runs out.
        </p>
        {submitError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {submitError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" disabled={submitting} onClick={() => setConfirm(false)}>
            Keep working
          </Button>
          <Button variant="danger" disabled={submitting} onClick={finish}>
            {submitting ? "Submitting…" : "Submit exam"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
