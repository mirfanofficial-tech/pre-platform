"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getExam } from "@/lib/exam";

export default function PracticeHubPage() {
  const slug = useSearchParams().get("exam") ?? "lat";
  const { data, isPending, error } = useQuery({ queryKey: ["exam", slug], queryFn: () => getExam(slug) });
  const subjects = data?.subjects.filter((s) => s.kind === "mcq") ?? [];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Practice MCQs</h1>
        <p className="text-ink-3">Pick a subject and drill topic-wise sets with instant explanations.</p>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-brand-50 p-5">
        <div>
          <p className="font-bold">Mixed practice set</p>
          <p className="text-sm text-ink-2">10 random questions from every {data?.name ?? "exam"} subject.</p>
        </div>
        <ButtonLink href={`/practice/session?exam=${slug}`}>Start mixed set</ButtonLink>
      </Card>
      {isPending && <p className="text-ink-3">Loading subjects…</p>}
      {error && <Card className="text-center text-ink-3">Could not load the subjects.</Card>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2 p-5">
            <h2 className="font-bold">{s.name}</h2>
            <p className="text-[13px] text-ink-3">
              {s.question_count} {s.question_count === 1 ? "question" : "questions"} available
            </p>
            {s.question_count > 0 ? (
              <ButtonLink href={`/practice/session?exam=${slug}&subject=${s.id}`} className="mt-3" size="sm">
                Practise {s.name}
              </ButtonLink>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Questions coming soon</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
