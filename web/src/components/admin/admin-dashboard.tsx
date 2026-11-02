"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem } from "@/components/admin/common";
import { getAdminStats } from "@/lib/admin";
import { formatPKR } from "@/lib/billing";

const statusLabel: Record<string, string> = {
  draft: "Drafts",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

export function AdminDashboard() {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "stats"], queryFn: getAdminStats });

  if (isPending) return <p className="text-ink-3">Loading the overview…</p>;
  if (error) return <LoadProblem error={error} retry={refetch} />;

  const topStats: [string, string, string][] = [
    ["Students", data.students.toLocaleString("en-GB"), `${data.active_last_7_days} active in the last 7 days`],
    ["Premium students", data.premium_now.toLocaleString("en-GB"), "With an active Premium period"],
    ["Revenue this month", formatPKR(data.revenue_this_month_paisa), `${formatPKR(data.revenue_total_paisa)} in total`],
    ["Waiting for review", String(data.pending_reviews), `${data.open_reports} open question reports`],
  ];
  const peakSignups = Math.max(1, ...data.signups.map((w) => w.signups));
  const peakExam = Math.max(1, ...data.questions_by_exam.map((q) => q.value));
  const totalQuestions = data.questions_by_status.reduce((n, s) => n + s.value, 0);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Platform overview</h1>
          <p className="text-ink-3">Live numbers from the database.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/admin/questions/import" variant="secondary">
            Import questions
          </ButtonLink>
          <ButtonLink href="/admin/questions/new">Create MCQ</ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {topStats.map(([label, value, note]) => (
          <Card key={label} className="p-5">
            <p className="text-[13px] text-ink-3">{label}</p>
            <p className="mt-1 text-[28px] font-extrabold">{value}</p>
            <p className="text-xs font-medium text-brand-700">{note}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.questions_by_status.map((s) => (
          <Link key={s.name} href={`/admin/questions?status=${s.name}`}>
            <Card className="p-4 transition-colors hover:border-brand-600">
              <p className="text-xl font-extrabold">{s.value.toLocaleString("en-GB")}</p>
              <p className="text-xs text-ink-3">{statusLabel[s.name] ?? s.name}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="font-bold">New registrations</h2>
          <p className="text-xs text-ink-3">Last {data.signups.length} weeks</p>
          <div className="mt-4 flex h-44 items-end gap-2">
            {data.signups.map((w) => (
              <div key={w.week_start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold">{w.signups}</span>
                <div
                  className="w-full rounded-sm bg-brand-500"
                  style={{ height: `${Math.max(2, (w.signups / peakSignups) * 80)}%` }}
                />
                <span className="text-[10px] text-ink-3">
                  {new Date(`${w.week_start}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-bold">Published questions by exam</h2>
          <p className="text-xs text-ink-3">{totalQuestions.toLocaleString("en-GB")} questions in total</p>
          {data.questions_by_exam.length === 0 ? (
            <p className="mt-4 text-sm text-ink-3">No questions are published yet.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {data.questions_by_exam.map((q) => (
                <div key={q.name}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="font-medium">{q.name}</span>
                    <span className="text-ink-3">{q.value.toLocaleString("en-GB")}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-neutral">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${(q.value / peakExam) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Quick links</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["/admin/questions?status=in_review", "Review questions", `${data.pending_reviews} waiting`],
            ["/admin/reports", "Reported questions", `${data.open_reports} open`],
            ["/admin/students", "Manage students", "Search, suspend, grant Premium"],
            ["/admin/subscriptions", "Payments", "History and refunds"],
          ].map(([href, title, note]) => (
            <Link key={href} href={href}>
              <Card className="flex items-center justify-between p-5 transition-colors hover:border-brand-600">
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="text-[13px] text-ink-3">{note}</span>
                </span>
                <ArrowRight size={16} className="text-ink-muted" />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
