"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/card";
import { MockTestList } from "@/components/exam/mock-test-list";
import { getExam, getProgress, listBookmarks, type ExamDetail } from "@/lib/exam";

const accessLabel: Record<string, string> = { free: "Free", premium: "Premium", mixed: "Free + Premium" };

const sections = [
  ["Overview", "#overview"],
  ["Subjects", "#subjects"],
  ["Mock Tests", "#mocks"],
  ["Study Materials", "#materials"],
  ["Saved Questions", "#saved"],
];

function Body({ exam }: { exam: ExamDetail }) {
  const progress = useQuery({ queryKey: ["progress"], queryFn: getProgress });
  const bookmarks = useQuery({ queryKey: ["bookmarks"], queryFn: listBookmarks });

  const names = new Set(exam.subjects.map((s) => s.name));
  const accuracy = new Map(progress.data?.subjects.map((s) => [s.name, s.percent]));
  const weak = (progress.data?.weak_topics ?? []).filter((t) => names.has(t.subject));
  const saved = (bookmarks.data ?? []).filter((b) => names.has(b.section));
  const target = progress.data?.target?.slug === exam.slug ? progress.data.target : null;

  const stats: [string, string, string][] = [
    ["Questions in the bank", exam.question_count.toLocaleString("en-GB"), "Written by subject teachers"],
    ["Sections", String(exam.subject_count), "Practise one at a time"],
    ["Mock tests", String(exam.mock_test_count), "Timed, with full review"],
    [
      "Days to exam",
      target?.days_left != null ? String(target.days_left) : "—",
      target ? "From your target date" : "Set your target in Settings",
    ],
  ];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
      <Card className="flex flex-wrap items-start justify-between gap-5 bg-brand-900 text-white">
        <div className="max-w-[640px]">
          <div className="mb-3 flex gap-2">
            <Badge className="bg-white/15 text-white">{accessLabel[exam.access] ?? exam.access}</Badge>
            <Badge className="bg-white/15 text-white">{exam.category}</Badge>
          </div>
          <h1 className="text-[28px] font-bold">
            {exam.name} — {exam.full_name}
          </h1>
          <p className="mt-2 text-brand-100/80">
            {exam.description} Practice material is written by subject teachers and modelled on the published paper
            pattern — it is not official past-paper content.
          </p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/exams" variant="secondary" className="border-white/30 bg-transparent text-white hover:bg-white/10">
            Switch exam
          </ButtonLink>
          <ButtonLink href="/mock-tests" variant="inverse">
            Start full mock test
          </ButtonLink>
        </div>
      </Card>

      <nav aria-label={`${exam.name} sections`} className="-mt-2 flex gap-1 overflow-x-auto border-b border-line">
        {sections.map(([l, h], i) => (
          <a
            key={l}
            href={h}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${i === 0 ? "border-brand-600 text-brand-800" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {l}
          </a>
        ))}
      </nav>

      <div id="overview" className="grid scroll-mt-4 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([l, v, d]) => (
          <Card key={l} className="p-5">
            <p className="text-[13px] text-ink-3">{l}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-tight">{v}</p>
            <p className="text-xs font-medium text-brand-700">{d}</p>
          </Card>
        ))}
      </div>

      <section id="subjects" className="scroll-mt-4">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Practice by section</h2>
          <span className="text-xs text-ink-3">{exam.subject_count} sections</span>
        </div>
        {exam.subjects.length === 0 ? (
          <Card className="text-center text-ink-3">Sections for {exam.name} are being added.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exam.subjects.map((s) => {
              const percent = accuracy.get(s.name);
              return (
                <Card key={s.id} className="flex flex-col gap-2 p-5">
                  <Badge tone={s.kind === "mcq" ? "brand" : "info"} className="w-fit">
                    {s.kind === "mcq" ? "MCQs" : "Written"}
                  </Badge>
                  <h3 className="font-bold">{s.name}</h3>
                  <p className="text-[13px] text-ink-3">
                    {s.kind === "mcq"
                      ? `${s.question_count} ${s.question_count === 1 ? "question" : "questions"}`
                      : "Guides and marking criteria"}
                  </p>
                  {s.kind === "mcq" && (
                    <>
                      <ProgressBar value={percent ?? 0} className="mt-2" />
                      <p className="text-xs text-ink-3">
                        {percent === undefined ? "Not attempted yet" : `${percent}% accuracy`}
                      </p>
                    </>
                  )}
                  {s.kind === "mcq" && s.question_count > 0 ? (
                    <ButtonLink
                      href={`/practice/session?exam=${exam.slug}&subject=${s.id}`}
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                    >
                      Practice
                    </ButtonLink>
                  ) : s.kind === "mcq" ? (
                    <p className="mt-2 text-sm text-ink-muted">Questions coming soon</p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section id="mocks" className="scroll-mt-4">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Full-length mock tests</h2>
          <Link href="/mock-tests" className="text-sm font-semibold text-brand-700">
            All mock tests
          </Link>
        </div>
        <MockTestList exam={exam.slug} />
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-xl font-bold">Recommended practice</h2>
          {weak.length === 0 ? (
            <Card className="text-sm text-ink-3">
              Answer a few questions and the topics you find hardest will be suggested here.
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {weak.map((t) => (
                <Card key={t.topic_id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-semibold">{t.topic}</p>
                    <p className="text-xs text-ink-3">
                      {t.subject} · {t.percent}% over {t.answered} questions
                    </p>
                  </div>
                  <ButtonLink href={`/practice?exam=${exam.slug}`} size="sm" variant="secondary">
                    Practise
                  </ButtonLink>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div id="materials" className="scroll-mt-4">
          <h2 className="mb-4 text-xl font-bold">Study materials</h2>
          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-ink-2">Notes, guides and formula sheets for {exam.name}.</p>
            <ButtonLink href="/materials" size="sm" variant="secondary">
              Open library
            </ButtonLink>
          </Card>
        </div>
      </section>

      <section id="saved" className="scroll-mt-4">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Saved and bookmarked</h2>
          <span className="text-xs text-ink-3">{saved.length}</span>
        </div>
        <Card className="p-0">
          {saved.length === 0 ? (
            <p className="p-5 text-sm text-ink-3">Bookmark a question while practising and it will show up here.</p>
          ) : (
            <ul>
              {saved.slice(0, 3).map((q) => (
                <li key={q.question_id} className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 last:border-0">
                  <p className="line-clamp-2 text-sm font-medium">{q.text}</p>
                  <Badge tone="neutral" className="shrink-0">
                    {q.section}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-4">
            <ButtonLink href="/saved" variant="secondary" size="sm">
              Review all saved questions
            </ButtonLink>
          </div>
        </Card>
      </section>
    </div>
  );
}

export function ExamView() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isPending, error } = useQuery({ queryKey: ["exam", slug], queryFn: () => getExam(slug) });

  if (isPending) return <p className="text-ink-3">Loading exam…</p>;
  if (error || !data) {
    return (
      <Card className="mx-auto max-w-[560px] text-center">
        <h1 className="font-bold">Exam not found</h1>
        <p className="mt-1 text-ink-3">We could not find that exam. It may have been removed.</p>
        <ButtonLink href="/exams" className="mt-4">
          Browse all exams
        </ButtonLink>
      </Card>
    );
  }
  return <Body exam={data} />;
}
