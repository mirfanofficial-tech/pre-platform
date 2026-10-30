"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { getProgress, type Progress } from "@/lib/exam";

export function useProgress() {
  return useQuery({ queryKey: ["progress"], queryFn: getProgress });
}

export function weekday(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

/** Loads the student's progress and renders children once it is available. */
export function ProgressGate({ children }: { children: (p: Progress) => ReactNode }) {
  const { data, isPending, error, refetch } = useProgress();
  if (isPending) return <p className="text-ink-3">Loading your progress…</p>;
  if (error) {
    return (
      <Card className="text-center">
        <p className="text-ink-3">Could not load your progress.</p>
        <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => refetch()}>
          Try again
        </button>
      </Card>
    );
  }
  return <>{children(data)}</>;
}
