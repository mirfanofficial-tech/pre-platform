"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listMockTests, type MockTest } from "@/lib/exam";

function Status({ m }: { m: MockTest }) {
  const last = m.last_attempt;
  if (!last) return <span>Not attempted</span>;
  if (last.status === "in_progress") return <Badge tone="warning">In progress</Badge>;
  return <span>Last score {last.percent}%</span>;
}

export function MockTestList({ exam }: { exam?: string }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["mock-tests", exam ?? "all"],
    queryFn: () => listMockTests(exam),
  });

  if (isPending) return <p className="text-ink-3">Loading mock tests…</p>;
  if (error) {
    return (
      <Card className="text-center">
        <p className="text-ink-3">Could not load the mock tests.</p>
        <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => refetch()}>
          Try again
        </button>
      </Card>
    );
  }
  if (data.length === 0) return <Card className="text-center text-ink-3">No mock tests are published yet.</Card>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((m) => {
        const last = m.last_attempt;
        const finished = last && last.status !== "in_progress";
        return (
          <Card key={m.id} className="flex items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-bold">{m.title}</h2>
              <p className="text-[13px] text-ink-3">
                {m.total_questions} questions · {Math.round(m.duration_sec / 60)} minutes · <Status m={m} />
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {finished && (
                <ButtonLink href={`/attempts/${last.id}/result`} variant="secondary" size="sm">
                  Review
                </ButtonLink>
              )}
              <ButtonLink href={`/mock-tests/${m.id}/take`} size="sm" variant={finished ? "secondary" : "primary"}>
                {last?.status === "in_progress" ? "Resume" : finished ? "Retake" : "Start test"}
              </ButtonLink>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
