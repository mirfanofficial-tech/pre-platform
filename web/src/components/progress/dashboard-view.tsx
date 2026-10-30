"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Flame, Play, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/card";
import { FirstName } from "@/components/layout/first-name";
import { ProgressGate, weekday } from "@/components/progress/progress-gate";
import { myAttempts, type AttemptSummary, type Progress } from "@/lib/exam";
import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

function weekDelta(p: Progress) {
  const diff = p.answered_this_week - p.answered_last_week;
  if (p.answered_this_week === 0 && p.answered_last_week === 0) return "Nothing yet this week";
  return `${p.answered_this_week} this week${diff ? ` (${diff > 0 ? "+" : ""}${diff} vs last week)` : ""}`;
}

function Stats({ p }: { p: Progress }) {
  const stats: [string, string, string][] = [
    ["Questions attempted", p.answered.toLocaleString("en-GB"), weekDelta(p)],
    ["Overall accuracy", p.accuracy === null ? "—" : `${p.accuracy}%`, p.answered ? `${p.correct} correct answers` : "Answer a question to start"],
    ["Mock tests completed", String(p.mocks_completed), p.mocks_completed ? "Keep going" : "Try your first mock test"],
    ["Current study streak", plural(p.streak_days, "day"), `Personal best: ${plural(p.best_streak, "day")}`],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {stats.map(([label, value, note], i) => (
        <Card key={label} className="p-4 sm:p-5">
          <p className="text-[13px] text-ink-3">{label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-extrabold leading-tight sm:text-[28px]">
            {value}
            {i === 3 && p.streak_days > 0 && <Flame size={20} className="text-warning" />}
          </p>
          <p className="text-xs font-medium text-brand-700">{note}</p>
        </Card>
      ))}
    </div>
  );
}

function Continue({ open }: { open: AttemptSummary | undefined }) {
  if (!open) {
    return (
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <span className="hidden size-12 place-items-center rounded-md bg-brand-50 text-brand-600 sm:grid">
          <Play size={22} />
        </span>
        <div className="min-w-[240px] flex-1">
          <p className="font-bold">Start a practice set</p>
          <p className="text-sm text-ink-3">Ten questions with instant feedback, or take a timed mock test.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/mock-tests" variant="secondary">
            Mock tests
          </ButtonLink>
          <ButtonLink href="/practice">Practice MCQs</ButtonLink>
        </div>
      </Card>
    );
  }
  const href = open.type === "practice" ? `/practice/session?attempt=${open.id}` : "/mock-tests";
  return (
    <Card className="flex flex-wrap items-center gap-5 p-5">
      <span className="hidden size-12 place-items-center rounded-md bg-brand-50 text-brand-600 sm:grid">
        <Play size={22} />
      </span>
      <div className="min-w-[240px] flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
          Continue preparation <Badge className="ml-2">{open.type === "mock" ? "Mock test" : "Practice"}</Badge>
        </p>
        <p className="mt-1 font-bold">{open.title}</p>
        <p className="text-xs text-ink-3">{open.total} questions</p>
      </div>
      <ButtonLink href={href}>{open.type === "mock" ? "Go to mock tests" : "Resume practice"}</ButtonLink>
    </Card>
  );
}

function Activity({ p }: { p: Progress }) {
  const best = Math.max(1, ...p.week.map((d) => d.answered));
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">Weekly study activity</h2>
        <span className="text-xs text-ink-3">Last 7 days</span>
      </div>
      <div className="mt-5 flex h-44 items-end gap-3">
        {p.week.map((d) => (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-xs font-semibold">{d.answered}</span>
            <div
              className={cn("w-full rounded-sm", d.answered === best ? "bg-brand-700" : "bg-brand-100")}
              style={{ height: `${Math.max(2, (d.answered / best) * 80)}%` }}
            />
            <span className="text-[11px] text-ink-3">{weekday(d.day)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Subjects({ p }: { p: Progress }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">Accuracy by subject</h2>
        <span className="text-xs text-ink-3">{p.target?.name ?? "All exams"}</span>
      </div>
      {p.subjects.length === 0 ? (
        <p className="mt-5 text-sm text-ink-3">Your subject accuracy will appear after you answer some questions.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3.5">
          {p.subjects.map((s) => (
            <div key={s.name}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="font-medium">{s.name}</span>
                <span className="text-ink-3">
                  {s.percent}% · {s.answered} answered
                </span>
              </div>
              <ProgressBar value={s.percent} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Recent({ attempts }: { attempts: AttemptSummary[] }) {
  const finished = attempts.filter((a) => a.status !== "in_progress").slice(0, 5);
  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="font-bold">Recent results</h2>
        <Link href="/mock-tests" className="text-sm font-semibold text-brand-700">
          Mock tests
        </Link>
      </div>
      {finished.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-3">Finished practice sets and mock tests are listed here.</p>
      ) : (
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-surface-subtle text-left text-xs text-ink-3">
            <tr>
              {["Attempt", "Date", "Score", "Accuracy", ""].map((h) => (
                <th key={h} className="px-5 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {finished.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="px-5 py-3 font-medium">{a.title}</td>
                <td className="px-5 py-3 text-ink-2">
                  {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                </td>
                <td className="px-5 py-3 font-semibold">
                  {a.score ?? 0} / {a.total}
                </td>
                <td className="px-5 py-3">{a.percent ?? 0}%</td>
                <td className="px-5 py-3">
                  <Link href={`/attempts/${a.id}/result`} className="font-semibold text-brand-700">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Weak({ p }: { p: Progress }) {
  return (
    <Card>
      <h2 className="font-bold">Recommended to improve</h2>
      {p.weak_topics.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          Once you have answered at least 3 questions in a topic, the ones you find hardest show up here.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {p.weak_topics.map((t) => (
            <li key={t.topic_id}>
              <Link
                href="/practice"
                className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
              >
                <span>
                  <span className="block text-sm font-semibold">{t.topic}</span>
                  <span className="text-xs text-ink-3">
                    {t.subject} · {t.percent}% over {t.answered} questions
                  </span>
                </span>
                <ChevronRight size={16} className="text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DashboardView() {
  const attempts = useQuery({ queryKey: ["attempts", "recent"], queryFn: () => myAttempts(undefined, 10) });
  return (
    <ProgressGate>
      {(p) => {
        const goalPercent = Math.min(100, Math.round((p.answered_today / p.daily_goal) * 100));
        return (
          <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2 text-[13px] font-semibold text-brand-800">
                <Target size={14} /> Daily goal{" "}
                <span>
                  {p.answered_today} / {p.daily_goal}
                </span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="flex flex-col justify-center">
                <h1 className="text-[28px] font-bold">
                  Welcome back, <FirstName />!
                </h1>
                <p className="mt-1 text-ink-3">
                  {p.answered_today >= p.daily_goal
                    ? "You have hit today’s goal. Nice work."
                    : `${p.daily_goal - p.answered_today} more questions to reach today’s goal.`}
                </p>
                <ProgressBar value={goalPercent} className="mt-3 max-w-[320px]" />
              </div>
              {p.target ? (
                <Card className="flex items-center justify-between border-0 bg-brand-800 p-5 text-white">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-100">Target exam</p>
                    <p className="text-xl font-bold">{p.target.name}</p>
                    {p.target.date && (
                      <p className="text-xs text-brand-100/80">
                        Paper on {new Date(`${p.target.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  {p.target.days_left !== null && (
                    <div className="rounded-md bg-white/10 px-4 py-2 text-center">
                      <p className="text-3xl font-extrabold leading-none">{p.target.days_left}</p>
                      <p className="text-[11px] text-brand-100">days left</p>
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="flex flex-col justify-center border-dashed p-5">
                  <p className="font-bold">Set a target exam</p>
                  <Link href="/settings" className="text-sm font-semibold text-brand-700">
                    Add your exam date in Settings
                  </Link>
                </Card>
              )}
            </div>

            <Stats p={p} />
            <Continue open={attempts.data?.find((a) => a.status === "in_progress")} />

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Activity p={p} />
              <Subjects p={p} />
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Recent attempts={attempts.data ?? []} />
              <Weak p={p} />
            </div>
          </div>
        );
      }}
    </ProgressGate>
  );
}
