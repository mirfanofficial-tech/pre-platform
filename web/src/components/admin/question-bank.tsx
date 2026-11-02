"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, Pager } from "@/components/admin/common";
import { listAdminQuestions } from "@/lib/admin";
import { listExams } from "@/lib/exam";

const PAGE_SIZE = 20;
const selectClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";
const statusTone = { published: "brand", draft: "neutral", in_review: "warning", archived: "neutral" } as const;
const statusLabel = { published: "Published", draft: "Draft", in_review: "In review", archived: "Archived" } as const;
const diffTone = { easy: "brand", medium: "warning", hard: "danger" } as const;

export function QuestionBank() {
  const [status, setStatus] = useState(useSearchParams().get("status") ?? "");
  const [exam, setExam] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());

  const exams = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["admin", "questions", { status, exam, q, page }],
    queryFn: () => listAdminQuestions({ status, exam, q, page, page_size: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold">Question Bank</h1>
        <div className="flex gap-3">
          <ButtonLink href="/admin/questions/import" variant="secondary">
            Import CSV
          </ButtonLink>
          <ButtonLink href="/admin/questions/new">Create MCQ</ButtonLink>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search questions"
            placeholder="Search question text"
            className="h-11 w-full rounded-md border border-line-strong bg-white pl-10 pr-4 text-sm"
          />
        </div>
        <select
          aria-label="Exam"
          value={exam}
          onChange={(e) => {
            setExam(e.target.value);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="">All exams</option>
          {exams.data?.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="">Any status</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && !data ? (
        <LoadProblem error={error} retry={refetch} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["Question", "Exam · Subject", "Difficulty", "Status", "Reports"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-ink-3">
                    Loading…
                  </td>
                </tr>
              )}
              {data?.items.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="max-w-[420px] px-5 py-3.5">
                    <Link href={`/admin/questions/${row.id}`} className="line-clamp-2 font-medium hover:text-brand-700">
                      {row.text}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-2">
                    {row.exam.toUpperCase()} · {row.subject}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={diffTone[row.difficulty as keyof typeof diffTone] ?? "neutral"}>{row.difficulty}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone[row.status as keyof typeof statusTone] ?? "neutral"}>
                      {statusLabel[row.status as keyof typeof statusLabel] ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-ink-2">{row.reported_count || "—"}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-ink-3">
                    No questions match. Try different filters or create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />}
        </Card>
      )}
    </div>
  );
}
