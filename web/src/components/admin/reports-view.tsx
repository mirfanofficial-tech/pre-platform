"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, problemText, shortDate } from "@/components/admin/common";
import { listReports, resolveReport } from "@/lib/admin";
import { cn } from "@/lib/utils";

const reasons: Record<string, string> = {
  wrong_answer: "Wrong answer",
  typo: "Typo",
  unclear: "Unclear",
  other: "Other",
};
const tabs = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["dismissed", "Dismissed"],
] as const;

export function ReportsView() {
  const client = useQueryClient();
  const [status, setStatus] = useState<string>("open");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: () => listReports(status),
  });
  const resolve = useMutation({
    mutationFn: ({ id, to }: { id: string; to: "resolved" | "dismissed" }) => resolveReport(id, to),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Reported questions</h1>
        <p className="text-ink-3">Students flag questions that look wrong. Fix the question, then mark the report resolved.</p>
      </div>
      <div className="flex gap-2">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium",
              status === value ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-ink-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {resolve.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-danger">
          {problemText(resolve.error)}
        </p>
      )}
      {isPending && <p className="text-ink-3">Loading…</p>}
      {error && <LoadProblem error={error} retry={refetch} />}
      {data && data.length === 0 && <Card className="text-center text-ink-3">Nothing here.</Card>}
      <div className="flex flex-col gap-3">
        {data?.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">{reasons[r.reason] ?? r.reason}</Badge>
              <span className="text-xs text-ink-3">
                {r.reporter ?? "A student"} · {shortDate(r.created_at)}
              </span>
            </div>
            <Link href={`/admin/questions/${r.question_id}`} className="line-clamp-3 font-medium hover:text-brand-700">
              {r.question}
            </Link>
            {r.note && <p className="text-sm text-ink-2">“{r.note}”</p>}
            {r.status === "open" && (
              <div className="mt-1 flex gap-2">
                <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, to: "resolved" })}>
                  Mark resolved
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ id: r.id, to: "dismissed" })}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
