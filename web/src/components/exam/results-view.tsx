"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatClock } from "@/components/exam/palette";
import { ApiError } from "@/lib/api";
import { getResult, myAttempts } from "@/lib/exam";
import { cn } from "@/lib/utils";

function Ring({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-extrabold leading-none">{pct}%</p>
          <p className="mt-1 text-[11px] text-brand-100">overall score</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <Card className="flex items-start justify-between p-4 sm:p-5">
      <div>
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className="mt-1 text-[28px] font-extrabold leading-tight">{value}</p>
        <p className="text-xs text-ink-3">{sub}</p>
      </div>
      <span className={cn("grid size-9 place-items-center rounded-full", tone)}>
        <Icon size={18} />
      </span>
    </Card>
  );
}

export function ResultsView() {
  const { id } = useParams<{ id: string }>();
  const result = useQuery({
    queryKey: ["result", id],
    queryFn: () => getResult(id),
    retry: (count, e) => !(e instanceof ApiError) && count < 2,
  });
  const history = useQuery({
    queryKey: ["attempts", result.data?.type],
    queryFn: () => myAttempts(result.data?.type, 8),
    enabled: !!result.data,
  });

  if (result.isPending) return <p className="text-ink-3">Loading your result…</p>;
  if (result.error || !result.data) {
    const inProgress = result.error instanceof ApiError && result.error.code === "attempt_in_progress";
    return (
      <Card className="mx-auto mt-10 max-w-[480px] text-center">
        <h1 className="text-xl font-bold">{inProgress ? "This attempt is not finished" : "Result not available"}</h1>
        <p className="mt-2 text-ink-3">
          {inProgress ? "Submit the attempt to see your score." : "We could not load this result."}
        </p>
        <ButtonLink href="/mock-tests" className="mt-5">
          Mock tests
        </ButtonLink>
      </Card>
    );
  }

  const r = result.data;
  const sections = r.sections.map((s) => ({ ...s, acc: Math.round((s.correct / s.total) * 100) }));
  const focus = [...sections].reverse().filter((s) => s.acc < 100).slice(0, 3);

  const finished = (history.data ?? [])
    .filter((a) => a.status !== "in_progress" && a.percent !== null)
    .slice(0, 5)
    .reverse();
  const index = finished.findIndex((a) => a.id === r.id);
  const previous = index > 0 ? finished[index - 1].percent! : null;
  const best = Math.max(0, ...finished.filter((a) => a.id !== r.id).map((a) => a.percent!));

  const total = r.total;
  const pctOf = (n: number) => (n / total) * 100;
  const donut = `conic-gradient(#059669 0 ${pctOf(r.correct)}%, #dc2626 ${pctOf(r.correct)}% ${pctOf(r.correct + r.incorrect)}%, #d1d5db ${pctOf(r.correct + r.incorrect)}% 100%)`;
  const attempted = r.correct + r.incorrect;
  const share = (n: number) => `${attempted ? Math.round((n / attempted) * 100) : 0}% of attempted`;
  const isMock = r.type === "mock";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div>
        <p className="text-xs font-semibold text-brand-700">{isMock ? "Mock Tests" : "Practice"} · Result</p>
        <h1 className="text-[28px] font-bold">{r.title}</h1>
        {r.status === "expired" && (
          <p className="mt-1 text-sm text-amber-700">Time ran out — your saved answers were marked automatically.</p>
        )}
      </div>

      <Card className="flex flex-col items-center gap-6 border-0 bg-brand-900 p-7 text-white md:flex-row">
        <Ring pct={r.percent} />
        <div className="flex-1 text-center md:text-left">
          <p className="text-2xl font-bold">
            {r.score} out of {r.max_score}
            {previous !== null && r.percent > best ? " — your best score so far" : ""}
          </p>
          <p className="mt-1 text-sm text-brand-100/80">
            {previous !== null && r.percent > previous
              ? `That is ${r.percent - previous} points above your previous attempt. `
              : "Each attempt shows you what to fix. "}
            {focus[0] ? `${focus[0].name} is the section costing you the most marks.` : "Well done on a clean paper."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3 md:justify-start">
            <ButtonLink href={`/attempts/${r.id}/review`} variant="inverse">
              Review answers
            </ButtonLink>
            <ButtonLink
              href={isMock ? "/mock-tests" : "/practice"}
              variant="secondary"
              className="border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              {isMock ? "Try another mock test" : "Practise again"}
            </ButtonLink>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={CheckCircle2} tone="bg-brand-50 text-brand-600" label="Correct answers" value={r.correct} sub={share(r.correct)} />
        <StatCard icon={XCircle} tone="bg-danger-bg text-danger" label="Incorrect answers" value={r.incorrect} sub={share(r.incorrect)} />
        <StatCard icon={MinusCircle} tone="bg-surface-neutral text-ink-3" label="Unanswered" value={r.skipped} sub={`${r.skipped} skipped questions`} />
        <StatCard icon={Clock} tone="bg-info-bg text-info" label="Time taken" value={formatClock(r.time_spent_sec)} sub="from start to submit" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-x-auto">
            <h2 className="font-bold">Subject-wise performance</h2>
            <p className="text-xs text-ink-3">Marks out of section total</p>
            <table className="mt-4 w-full text-sm sm:min-w-[420px]">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="pb-2 font-medium">Section</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Accuracy</th>
                  <th className="w-[35%] pb-2 font-medium max-sm:hidden">Performance</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.name} className="border-t border-line">
                    <td className="py-3 font-medium">{s.name}</td>
                    <td className="py-3">
                      {s.correct} / {s.total}
                    </td>
                    <td className="py-3 font-semibold">{s.acc}%</td>
                    <td className="py-3 max-sm:hidden">
                      <div className="h-2 overflow-hidden rounded-full bg-surface-neutral">
                        <div className={cn("h-full rounded-full", s.acc < 50 ? "bg-warning" : "bg-brand-600")} style={{ width: `${s.acc}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="font-bold">Comparison with your previous attempts</h2>
            <p className="text-xs text-ink-3">Score out of 100 — your last {isMock ? "mock tests" : "practice sets"}</p>
            {finished.length < 2 ? (
              <p className="mt-4 text-sm text-ink-3">Finish another attempt to see your trend.</p>
            ) : (
              <div className="mt-4 flex h-48 items-end gap-4">
                {finished.map((a, i) => (
                  <div key={a.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-xs font-semibold">{a.percent}</span>
                    <div
                      className={`w-full rounded-sm ${a.id === r.id ? "bg-brand-600" : "bg-brand-100"}`}
                      style={{ height: `${Math.max(a.percent!, 3) * 1.3}%` }}
                    />
                    <span className="text-[11px] text-ink-3">{a.id === r.id ? "This one" : `#${i + 1}`}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="border-brand-100 bg-brand-50">
            <h2 className="font-bold">Where to focus next</h2>
            <p className="mt-1 text-xs text-ink-2">
              These sections are pulling your total down. Clearing them could add marks on your next paper.
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {focus.length === 0 && (
                <li className="rounded-md bg-white p-3 text-sm text-ink-2">Nothing to fix — every section is full marks.</li>
              )}
              {focus.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 rounded-md bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-ink-3">{s.acc}% in this paper</p>
                  </div>
                  <span className="text-xs font-bold text-brand-700">+{s.total - s.correct} marks</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/practice" className="mt-4 w-full">
              Practice these topics
            </ButtonLink>
          </Card>

          <Card>
            <h2 className="font-bold">Answer breakdown</h2>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative size-28 shrink-0 rounded-full" style={{ background: donut }}>
                <div className="absolute inset-[14px] grid place-items-center rounded-full bg-white text-center">
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{total}</p>
                    <p className="text-[11px] text-ink-3">questions</p>
                  </div>
                </div>
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm">
                {[
                  ["bg-brand-600", "Correct", r.correct],
                  ["bg-danger", "Incorrect", r.incorrect],
                  ["bg-line-strong", "Unanswered", r.skipped],
                ].map(([dot, l, n]) => (
                  <li key={l as string} className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", dot as string)} />
                    <span className="flex-1 text-ink-2">{l}</span>
                    <span className="font-bold">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
      <p className="text-xs text-ink-3">
        Scores reflect this practice paper only and are not a prediction of official exam results.
      </p>
    </div>
  );
}
