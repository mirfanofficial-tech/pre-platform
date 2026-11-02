"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, problemText } from "@/components/admin/common";
import { createMock, listAdminExams, listAdminMocks, type MockBody } from "@/lib/admin";
import { listExams } from "@/lib/exam";

const inputClass = "h-11 w-full min-w-0 rounded-md border border-line-strong bg-white px-3 text-sm";
const statusTone = { published: "brand", draft: "warning", archived: "neutral" } as const;

export function MockFields({
  value,
  onChange,
  examLocked,
}: {
  value: MockBody;
  onChange: (next: MockBody) => void;
  examLocked: boolean;
}) {
  const exams = useQuery({ queryKey: ["admin", "exams"], queryFn: listAdminExams });
  const set = (patch: Partial<MockBody>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Exam
        <select className={inputClass} value={value.exam} disabled={examLocked} onChange={(e) => set({ exam: e.target.value })}>
          {exams.data?.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Title
        <input className={inputClass} value={value.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Time allowed (minutes)
        <input className={inputClass} type="number" min={1} max={600} value={value.duration_minutes} onChange={(e) => set({ duration_minutes: Number(e.target.value) })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Marks per question
        <input className={inputClass} type="number" min={1} max={10} value={value.marks_per_question ?? 1} onChange={(e) => set({ marks_per_question: Number(e.target.value) })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Type
        <select className={inputClass} value={value.kind} onChange={(e) => set({ kind: e.target.value as MockBody["kind"] })}>
          <option value="full">Full-length paper</option>
          <option value="sectional">Sectional test</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-medium">
        Who can take it
        <select className={inputClass} value={value.access} onChange={(e) => set({ access: e.target.value as MockBody["access"] })}>
          <option value="free">Everyone</option>
          <option value="premium">Premium students only</option>
        </select>
      </label>
    </div>
  );
}

export function MocksAdmin() {
  const client = useQueryClient();
  const router = useRouter();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "mocks"], queryFn: listAdminMocks });
  const exams = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<MockBody>({ exam: "lat", title: "", kind: "full", duration_minutes: 60, marks_per_question: 1, access: "free" });

  const create = useMutation({
    mutationFn: () => createMock(draft),
    onSuccess: (mock) => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      router.push(`/admin/mock-tests/${mock.id}`);
    },
  });
  const exam = draft.exam || exams.data?.[0]?.slug || "lat";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold">Mock Tests</h1>
          <p className="text-ink-3">Build timed papers from published questions.</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>New mock test</Button>}
      </div>

      {adding && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-bold">New mock test</h2>
          <MockFields value={{ ...draft, exam }} onChange={setDraft} examLocked={false} />
          {create.isError && (
            <p role="alert" className="text-sm text-danger">
              {problemText(create.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={!draft.title.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create and add questions"}
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
                {["Mock test", "Exam", "Questions", "Time", "Access", "Taken", "Status"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/mock-tests/${m.id}`} className="font-medium hover:text-brand-700">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-2">{m.exam.toUpperCase()}</td>
                  <td className="px-5 py-3.5">{m.question_count}</td>
                  <td className="px-5 py-3.5">{m.duration_minutes} min</td>
                  <td className="px-5 py-3.5">{m.access === "premium" ? "Premium" : "Everyone"}</td>
                  <td className="px-5 py-3.5">{m.attempts}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone[m.status as keyof typeof statusTone] ?? "neutral"}>{m.status}</Badge>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-ink-3">
                    No mock tests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
