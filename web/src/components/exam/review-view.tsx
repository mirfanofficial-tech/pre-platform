"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Flag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getReview, type ReviewItem } from "@/lib/exam";
import { cn } from "@/lib/utils";
import { letters } from "./palette";

const filters = {
  all: { label: "All", test: () => true },
  incorrect: { label: "Incorrect", test: (i: ReviewItem) => i.is_correct === false },
  skipped: { label: "Skipped", test: (i: ReviewItem) => i.is_correct === null },
  marked: { label: "Marked for review", test: (i: ReviewItem) => i.marked_for_review },
};

export function ReviewView() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<keyof typeof filters>("all");
  const review = useQuery({
    queryKey: ["review", id],
    queryFn: () => getReview(id),
    retry: (count, e) => !(e instanceof ApiError) && count < 2,
  });

  if (review.isPending) return <p className="text-ink-3">Loading your answers…</p>;
  if (review.error || !review.data) {
    return (
      <Card className="mx-auto mt-10 max-w-[480px] text-center">
        <h1 className="text-xl font-bold">Review not available</h1>
        <p className="mt-2 text-ink-3">Finish and submit the attempt first, then review your answers.</p>
        <ButtonLink href="/mock-tests" className="mt-5">
          Mock tests
        </ButtonLink>
      </Card>
    );
  }

  const items = review.data;
  const shown = items.filter(filters[filter].test);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-700">Review</p>
          <h1 className="text-[28px] font-bold">Your answers</h1>
        </div>
        <Link href={`/attempts/${id}/result`} className="text-sm font-semibold text-brand-700">
          ← Back to result
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(filters) as (keyof typeof filters)[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium",
              filter === key ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-ink-2",
            )}
          >
            {filters[key].label} ({items.filter(filters[key].test).length})
          </button>
        ))}
      </div>

      {shown.length === 0 && <Card className="text-center text-ink-3">Nothing here.</Card>}

      {shown.map((item) => (
        <Card key={item.question_id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Question {item.position}</span>
            <Badge tone="neutral">{item.section}</Badge>
            {item.is_correct === true && <Badge>Correct</Badge>}
            {item.is_correct === false && <Badge tone="danger">Incorrect</Badge>}
            {item.is_correct === null && <Badge tone="neutral">Skipped</Badge>}
            {item.marked_for_review && (
              <Badge tone="warning">
                <Flag size={12} /> Marked
              </Badge>
            )}
          </div>
          <p className="whitespace-pre-line leading-relaxed">{item.text}</p>
          <ul className="flex flex-col gap-2">
            {item.options.map((o, i) => {
              const chosen = o.id === item.selected_option_id;
              return (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm",
                    o.is_correct && "border-brand-600 bg-brand-50",
                    chosen && !o.is_correct && "border-danger bg-danger-bg",
                    !o.is_correct && !chosen && "border-line",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold ring-1 ring-line">
                    {letters[i]}
                  </span>
                  <span className="flex-1">{o.text}</span>
                  {chosen && <span className="text-xs text-ink-3">Your answer</span>}
                  {o.is_correct && <Check size={16} className="text-brand-600" aria-label="Correct answer" />}
                  {chosen && !o.is_correct && <X size={16} className="text-danger" aria-label="Incorrect" />}
                </li>
              );
            })}
          </ul>
          {item.explanation && (
            <p className="rounded-md bg-surface-subtle p-3.5 text-sm leading-relaxed text-ink-2">
              <strong className="text-ink">Explanation. </strong>
              {item.explanation}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
