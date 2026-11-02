"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, problemText } from "@/components/admin/common";
import { createExam, listAdminExams, type ExamBody } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

const inputClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";
const statusTone = { published: "brand", draft: "warning", archived: "neutral" } as const;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Fields shared by "new exam" and "edit exam". */
export function ExamFields({
  value,
  onChange,
  slugLocked,
}: {
  value: ExamBody;
  onChange: (next: ExamBody) => void;
  slugLocked: boolean;
}) {
  const set = (patch: Partial<ExamBody>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Short name
        <input
          className={inputClass}
          value={value.name}
          maxLength={120}
          onChange={(e) => set({ name: e.target.value, ...(slugLocked ? {} : { slug: slugify(e.target.value) }) })}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Web address name
        <input
          className={cn(inputClass, slugLocked && "bg-surface-neutral")}
          value={value.slug}
          readOnly={slugLocked}
          maxLength={64}
          onChange={(e) => set({ slug: slugify(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium sm:col-span-2">
        Full name
        <input className={inputClass} value={value.full_name} maxLength={200} onChange={(e) => set({ full_name: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Category
        <input className={inputClass} value={value.category} maxLength={64} onChange={(e) => set({ category: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Display order
        <input
          className={inputClass}
          type="number"
          min={0}
          value={value.sort ?? 0}
          onChange={(e) => set({ sort: Number(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Access
        <select className={inputClass} value={value.access} onChange={(e) => set({ access: e.target.value as ExamBody["access"] })}>
          <option value="mixed">Free and Premium content</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Status
        <select className={inputClass} value={value.status} onChange={(e) => set({ status: e.target.value as ExamBody["status"] })}>
          <option value="draft">Draft (hidden from students)</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium sm:col-span-2">
        Description shown to students
        <textarea
          className="rounded-md border border-line-strong p-3 text-sm"
          rows={3}
          maxLength={1000}
          value={value.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
    </div>
  );
}

export const emptyExam: ExamBody = {
  slug: "",
  name: "",
  full_name: "",
  category: "",
  description: "",
  access: "mixed",
  status: "draft",
  sort: 0,
};

export function ExamsAdmin() {
  const client = useQueryClient();
  const router = useRouter();
  const role = useMe().data?.role;
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "exams"], queryFn: listAdminExams });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyExam);

  const create = useMutation({
    mutationFn: () => createExam(draft),
    onSuccess: (exam) => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      void client.invalidateQueries({ queryKey: ["exams"] });
      router.push(`/admin/exams/${exam.slug}`);
    },
  });
  const ready = draft.slug.length >= 2 && draft.name.trim() && draft.full_name.trim() && draft.category.trim();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Exams &amp; Subjects</h1>
          <p className="text-ink-3">Add exams, then give each one subjects and topics to file questions under.</p>
        </div>
        {role === "admin" && !adding && <Button onClick={() => setAdding(true)}>New exam</Button>}
      </div>

      {adding && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-bold">New exam</h2>
          <ExamFields value={draft} onChange={setDraft} slugLocked={false} />
          {create.isError && (
            <p role="alert" className="text-sm text-danger">
              {problemText(create.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create exam"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isPending && <p className="text-ink-3">Loading…</p>}
      {error && <LoadProblem error={error} retry={refetch} />}
      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["Exam", "Category", "Status", "Sections", "Questions", "Mock tests"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.slug} className="border-t border-line">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/exams/${e.slug}`} className="font-medium hover:text-brand-700">
                      {e.name}
                    </Link>
                    <p className="text-xs text-ink-3">/{e.slug}</p>
                  </td>
                  <td className="px-5 py-3.5 text-ink-2">{e.category}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone[e.status as keyof typeof statusTone] ?? "neutral"}>{e.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5">{e.subject_count}</td>
                  <td className="px-5 py-3.5">{e.question_count}</td>
                  <td className="px-5 py-3.5">{e.mock_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
