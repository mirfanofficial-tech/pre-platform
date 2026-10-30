"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listBookmarks, removeBookmark, type Bookmark as BookmarkRow } from "@/lib/exam";

const KEY = ["bookmarks"] as const;

export default function SavedPage() {
  const client = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: KEY, queryFn: listBookmarks });
  const remove = useMutation({
    mutationFn: removeBookmark,
    onMutate: (id: string) =>
      client.setQueryData<BookmarkRow[]>(KEY, (rows = []) => rows.filter((b) => b.question_id !== id)),
    onError: () => client.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Saved questions</h1>
          <p className="text-ink-3">
            {data ? `${data.length} bookmarked` : "Your bookmarks"} · bookmark a question while you practise to find it here.
          </p>
        </div>
        <ButtonLink href="/practice">Go to practice</ButtonLink>
      </div>
      {isPending && <p className="text-ink-3">Loading…</p>}
      {error && <Card className="text-center text-ink-3">Could not load your saved questions.</Card>}
      {data && data.length === 0 && (
        <Card className="text-center text-ink-3">Nothing saved yet. Tap the bookmark on any question.</Card>
      )}
      <div className="flex flex-col gap-3">
        {data?.map((q) => (
          <Card key={q.question_id} className="flex items-start gap-4 p-5">
            <button
              aria-label="Remove bookmark"
              onClick={() => remove.mutate(q.question_id)}
              className="mt-0.5 shrink-0 text-brand-600 hover:text-danger"
            >
              <Bookmark size={18} className="fill-current" />
            </button>
            <div className="flex-1">
              <p className="whitespace-pre-line font-medium">{q.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="neutral">{q.section}</Badge>
                {q.topic && <Badge tone="neutral">{q.topic}</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
