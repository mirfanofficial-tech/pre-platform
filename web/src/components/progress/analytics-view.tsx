"use client";

import { Card, ProgressBar } from "@/components/ui/card";
import { ProgressGate } from "@/components/progress/progress-gate";

export function AnalyticsView() {
  return (
    <ProgressGate>
      {(p) => {
        const subjects = [...p.subjects].sort((a, b) => b.percent - a.percent);
        return (
          <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
            <div>
              <h1 className="text-[28px] font-bold">Performance analytics</h1>
              <p className="text-ink-3">Accuracy by subject and score trends across attempts.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="font-bold">Accuracy by subject</h2>
                {subjects.length === 0 ? (
                  <p className="mt-5 text-sm text-ink-3">Answer some questions to see your accuracy by subject.</p>
                ) : (
                  <div className="mt-5 flex flex-col gap-4">
                    {subjects.map((s) => (
                      <div key={s.name}>
                        <div className="mb-1.5 flex justify-between text-[13px]">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-ink-3">
                            {s.percent}% · {s.correct}/{s.answered}
                          </span>
                        </div>
                        <ProgressBar value={s.percent} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h2 className="font-bold">Score trend</h2>
                <p className="text-xs text-ink-3">Your last {p.trend.length || 10} finished attempts</p>
                {p.trend.length === 0 ? (
                  <p className="mt-5 text-sm text-ink-3">Finish a practice set or mock test to start your trend.</p>
                ) : (
                  <div className="mt-5 flex h-52 items-end gap-3">
                    {p.trend.map((t, i) => (
                      <div
                        key={t.attempt_id}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                        title={t.title}
                      >
                        <span className="text-xs font-semibold">{t.percent}%</span>
                        <div className="w-full rounded-sm bg-brand-500" style={{ height: `${Math.max(2, t.percent * 0.8)}%` }} />
                        <span className="text-[11px] text-ink-3">{t.type === "mock" ? "Mock" : "Set"} {i + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <Card>
              <h2 className="font-bold">Topics to work on</h2>
              {p.weak_topics.length === 0 ? (
                <p className="mt-3 text-sm text-ink-3">
                  Topics below 80% accuracy (with at least 3 answers) are listed here.
                </p>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {p.weak_topics.map((t) => (
                    <div key={t.topic_id}>
                      <div className="mb-1.5 flex justify-between text-[13px]">
                        <span className="font-medium">
                          {t.topic} <span className="text-ink-3">· {t.subject}</span>
                        </span>
                        <span className="text-ink-3">{t.percent}%</span>
                      </div>
                      <ProgressBar value={t.percent} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        );
      }}
    </ProgressGate>
  );
}
