import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QuestionTable } from "@/components/admin/question-table";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminActions, adminCounts, adminStats, questionsByExam, signups } from "@/data/extra";

export const metadata = { title: "Admin — PrepMaster" };

export default function AdminDashboardPage() {
  const maxSignup = Math.max(...signups);
  const maxQ = questionsByExam[0].value;
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Platform overview</h1>
          <p className="text-ink-3">Updated 27 Oct 2026, 11:05 AM</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/admin/reports" variant="secondary">
            Export report
          </ButtonLink>
          <ButtonLink href="/admin/questions/new">Create MCQ</ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {adminStats.map(([l, v, d]) => (
          <Card key={l} className="p-5">
            <p className="text-[13px] text-ink-3">{l}</p>
            <p className="mt-1 text-[28px] font-extrabold">{v}</p>
            <p className="text-xs font-medium text-brand-700">{d}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {adminCounts.map(([v, l]) => (
          <Card key={l} className="p-4">
            <p className="text-xl font-extrabold">{v}</p>
            <p className="text-xs text-ink-3">{l}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="font-bold">New student registrations</h2>
          <p className="text-xs text-ink-3">Last 12 weeks</p>
          <div className="mt-4 flex h-44 items-end gap-2">
            {signups.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-sm bg-brand-500" style={{ height: `${(v / maxSignup) * 100}%` }} />
                <span className="text-[10px] text-ink-3">W{i + 1}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-bold">Questions by exam</h2>
          <p className="text-xs text-ink-3">24,160 total</p>
          <div className="mt-4 flex flex-col gap-3">
            {questionsByExam.map((q) => (
              <div key={q.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="font-medium">{q.name}</span>
                  <span className="text-ink-3">{q.value.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-neutral">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${(q.value / maxQ) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recently added questions</h2>
          <Link href="/admin/questions" className="flex items-center gap-1 text-sm font-semibold text-brand-700">
            Manage question bank <ArrowRight size={14} />
          </Link>
        </div>
        <QuestionTable />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Admin actions</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminActions.map(([t, d]) => (
            <Card key={t} className="p-5">
              <p className="font-semibold">{t}</p>
              <p className="text-[13px] text-ink-3">{d}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
