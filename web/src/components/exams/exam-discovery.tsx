"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listExams, type ExamSummary } from "@/lib/exam";
import { cn } from "@/lib/utils";

const selectClass = "h-12 rounded-md border border-line-strong bg-white px-3 text-sm";
const accessLabel = { free: "Free", premium: "Premium", mixed: "Free + Premium" } as const;
const accessTone = { free: "info", premium: "warning", mixed: "brand" } as const;

const label = (a: string) => accessLabel[a as keyof typeof accessLabel] ?? a;
const tone = (a: string) => accessTone[a as keyof typeof accessTone] ?? "neutral";

function Featured({ exam }: { exam: ExamSummary }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-5 border-0 bg-brand-900 p-7 text-white">
      <div className="max-w-[640px]">
        <div className="mb-3 flex gap-2">
          <Badge className="bg-white/15 text-white">Featured exam</Badge>
          <Badge className="bg-white/15 text-white">{label(exam.access)}</Badge>
        </div>
        <h2 className="text-2xl font-bold">
          {exam.name} — {exam.full_name}
        </h2>
        <p className="mt-2 text-brand-100/80">
          {exam.subject_count} sections · {exam.question_count.toLocaleString("en-GB")} practice MCQs ·{" "}
          {exam.mock_test_count} mock {exam.mock_test_count === 1 ? "test" : "tests"}. {exam.description}
        </p>
      </div>
      <ButtonLink href={`/exams/${exam.slug}`} variant="inverse">
        Continue preparation
      </ButtonLink>
    </Card>
  );
}

export function ExamDiscovery() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All exams");
  const [access, setAccess] = useState("all");
  const [sort, setSort] = useState("popular");

  const exams = useMemo(() => data ?? [], [data]);
  const categories = useMemo(() => ["All exams", ...Array.from(new Set(exams.map((e) => e.category)))], [exams]);

  const results = useMemo(() => {
    const q = query.toLowerCase();
    const list = exams.filter(
      (e) =>
        (category === "All exams" || e.category === category) &&
        (access === "all" || e.access === access || e.access === "mixed") &&
        `${e.name} ${e.full_name} ${e.category} ${e.description}`.toLowerCase().includes(q),
    );
    return [...list].sort((a, b) =>
      sort === "popular" ? b.question_count - a.question_count : a.name.localeCompare(b.name),
    );
  }, [exams, query, category, access, sort]);

  const filtered = query !== "" || category !== "All exams" || access !== "all";
  const featured = [...exams].sort((a, b) => b.question_count - a.question_count)[0];
  const showFeatured = !filtered && featured !== undefined && featured.question_count > 0;
  const cards = showFeatured ? results.filter((e) => e.slug !== featured.slug) : results;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Find the exam you are preparing for</h1>
          <p className="text-ink-3">
            Every exam includes topic-wise practice, timed mock tests and performance analytics.
          </p>
        </div>
        <ButtonLink href="mailto:support@prepmaster.pk?subject=Exam%20request" variant="secondary" size="sm">
          Request an exam
        </ButtonLink>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search exams"
            placeholder="Search by exam name or category"
            className="h-12 w-full rounded-md border border-line-strong bg-white pl-10 pr-4"
          />
        </div>
        <select aria-label="Access" value={access} onChange={(e) => setAccess(e.target.value)} className={selectClass}>
          <option value="all">Free and premium</option>
          <option value="free">Has free content</option>
          <option value="premium">Has premium content</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
          <option value="popular">Sort: Most questions</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium",
              category === c ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-ink-2",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {isPending && <p className="text-ink-3">Loading exams…</p>}
      {error && (
        <Card className="text-center">
          <p className="text-ink-3">Could not load the exams.</p>
          <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => refetch()}>
            Try again
          </button>
        </Card>
      )}

      {showFeatured && <Featured exam={featured} />}

      {data && (
        <div className="flex flex-wrap items-center justify-between text-[13px] text-ink-3">
          <p>Showing {results.length} exams</p>
          <p>More exams are added every term</p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((e) => (
          <Card key={e.slug} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/exams/${e.slug}`} className="text-lg font-bold hover:text-brand-700">
                {e.name}
              </Link>
              <Badge tone={tone(e.access)} className="shrink-0">
                {label(e.access)}
              </Badge>
            </div>
            <p className="text-sm text-ink-2">{e.description || e.full_name}</p>
            <p className="text-[13px] text-ink-3">
              {e.question_count.toLocaleString("en-GB")} MCQs · {e.mock_test_count} mock{" "}
              {e.mock_test_count === 1 ? "test" : "tests"}
            </p>
            <Badge tone="neutral" className="w-fit">
              {e.category}
            </Badge>
            <ButtonLink href={`/exams/${e.slug}`} className="mt-auto">
              Start Preparation <ArrowRight size={16} />
            </ButtonLink>
          </Card>
        ))}
      </div>
      {data && results.length === 0 && (
        <Card className="text-center text-ink-3">No exams match your search. Try a different keyword.</Card>
      )}
    </div>
  );
}
