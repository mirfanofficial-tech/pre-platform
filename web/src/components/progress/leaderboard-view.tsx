"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ME_KEY, type User } from "@/lib/auth";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/exam";
import { cn } from "@/lib/utils";

type Period = "week" | "all";
const periods: [Period, string][] = [
  ["week", "This week"],
  ["all", "All time"],
];

function Row({ e }: { e: LeaderboardEntry }) {
  return (
    <tr className={cn("border-t border-line", e.is_me && "bg-brand-50")}>
      <td className="px-5 py-3.5 font-bold">{e.rank}</td>
      <td className="px-5 py-3.5">
        <span className="font-medium">{e.name}</span> {e.is_me && <Badge className="ml-1">You</Badge>}
      </td>
      <td className="px-5 py-3.5">{e.answered}</td>
      <td className="px-5 py-3.5">{e.percent}%</td>
      <td className="px-5 py-3.5 text-right font-bold">{e.correct}</td>
    </tr>
  );
}

export function LeaderboardView() {
  const [period, setPeriod] = useState<Period>("week");
  const client = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => getLeaderboard(period),
  });

  const setOptIn = useMutation({
    mutationFn: (value: boolean) => api<User>("/api/v1/me", { method: "PATCH", body: { leaderboard_opt_in: value } }),
    onSuccess: (user) => {
      client.setQueryData(ME_KEY, user);
      void client.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  const outsideTop = data?.me && !data.entries.some((e) => e.is_me);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Leaderboard</h1>
        <p className="text-ink-3">Ranked by correct answers. Only students who opt in appear, by first name and last initial.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {periods.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[13px] font-medium",
                period === value ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-ink-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {data?.opted_in && (
          <button
            className="text-sm font-semibold text-brand-700"
            disabled={setOptIn.isPending}
            onClick={() => setOptIn.mutate(false)}
          >
            Hide me from the leaderboard
          </button>
        )}
      </div>

      {data && !data.opted_in && (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-50 p-5">
          <div>
            <p className="font-bold">You are not on the leaderboard</p>
            <p className="text-sm text-ink-2">
              Join to see your rank. Others will only see your first name, last initial and score.
            </p>
          </div>
          <Button onClick={() => setOptIn.mutate(true)} disabled={setOptIn.isPending}>
            {setOptIn.isPending ? "Joining…" : "Show me on the leaderboard"}
          </Button>
        </Card>
      )}

      {isPending && <p className="text-ink-3">Loading the leaderboard…</p>}
      {error && (
        <Card className="text-center">
          <p className="text-ink-3">Could not load the leaderboard.</p>
          <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => refetch()}>
            Try again
          </button>
        </Card>
      )}

      {data &&
        (data.entries.length === 0 ? (
          <Card className="text-center text-ink-3">
            No one has scored {period === "week" ? "this week" : "yet"}. Answer some questions and be the first.
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-surface-subtle text-left text-xs text-ink-3">
                <tr>
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Answered</th>
                  <th className="px-5 py-3 font-medium">Accuracy</th>
                  <th className="px-5 py-3 text-right font-medium">Correct</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <Row key={e.rank} e={e} />
                ))}
                {outsideTop && data.me && (
                  <>
                    <tr className="border-t border-line text-center text-ink-muted">
                      <td colSpan={5}>…</td>
                    </tr>
                    <Row e={data.me} />
                  </>
                )}
              </tbody>
            </table>
          </Card>
        ))}
      {data?.opted_in && !data.me && (
        <p className="text-sm text-ink-3">You will appear here after you answer a question {period === "week" ? "this week" : ""}.</p>
      )}
    </div>
  );
}
