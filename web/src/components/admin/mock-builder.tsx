"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, problemText } from "@/components/admin/common";
import { MockFields } from "@/components/admin/mocks-admin";
import {
  deleteMock,
  getAdminMock,
  listAdminQuestions,
  setMockQuestions,
  setMockStatus,
  updateMock,
  type MockBody,
  type MockDetail,
} from "@/lib/admin";

const statusTone = { published: "brand", draft: "warning", archived: "neutral" } as const;

function Picker({ mock, onAdd, busy }: { mock: MockDetail; onAdd: (ids: string[]) => void; busy: boolean }) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [picked, setPicked] = useState<string[]>([]);
  const inPaper = new Set(mock.questions.map((r) => r.question_id));
  const { data, isPending } = useQuery({
    queryKey: ["admin", "picker", mock.exam, q],
    queryFn: () => listAdminQuestions({ exam: mock.exam, status: "published", q, page_size: 30 }),
    placeholderData: (previous) => previous,
  });
  const available = data?.items.filter((row) => !inPaper.has(row.id)) ?? [];

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-bold">Add questions</h2>
        <p className="text-xs text-ink-3">Only published {mock.exam.toUpperCase()} questions can be added.</p>
      </div>
      <input
        aria-label="Search published questions"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search question text"
        className="h-11 rounded-md border border-line-strong px-3 text-sm"
      />
      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto rounded-md border border-line">
        {isPending && <li className="p-3 text-sm text-ink-3">Loading…</li>}
        {available.map((row) => (
          <li key={row.id}>
            <label className="flex cursor-pointer items-start gap-3 p-3 text-sm hover:bg-surface-subtle">
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.includes(row.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, row.id] : p.filter((id) => id !== row.id)))}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2">{row.text}</span>
                <span className="text-xs text-ink-3">
                  {row.subject} · {row.difficulty}
                </span>
              </span>
            </label>
          </li>
        ))}
        {data && available.length === 0 && <li className="p-3 text-sm text-ink-3">Nothing to add. Try another search.</li>}
      </ul>
      <div>
        <Button
          disabled={picked.length === 0 || busy}
          onClick={() => {
            onAdd(picked);
            setPicked([]);
          }}
        >
          {picked.length ? `Add ${picked.length} selected` : "Add selected"}
        </Button>
      </div>
    </Card>
  );
}

function Builder({ mock }: { mock: MockDetail }) {
  const client = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<MockBody>({
    exam: mock.exam,
    title: mock.title,
    kind: mock.kind as MockBody["kind"],
    duration_minutes: mock.duration_minutes,
    marks_per_question: mock.marks_per_question,
    access: mock.access as MockBody["access"],
  });
  const [notice, setNotice] = useState("");

  const done = (updated: MockDetail, message = "") => {
    client.setQueryData(["admin", "mock", updated.id], updated);
    void client.invalidateQueries({ queryKey: ["admin", "mocks"] });
    void client.invalidateQueries({ queryKey: ["mock-tests"] });
    // A successful action replaces any earlier error message.
    save.reset();
    questions.reset();
    status.reset();
    setNotice(message);
  };
  const save = useMutation({ mutationFn: () => updateMock(mock.id, form), onSuccess: (m) => done(m, "Saved.") });
  const questions = useMutation({ mutationFn: (ids: string[]) => setMockQuestions(mock.id, ids), onSuccess: (m) => done(m) });
  const status = useMutation({
    mutationFn: (to: "draft" | "published" | "archived") => setMockStatus(mock.id, to),
    onSuccess: (m) => done(m, `Now ${m.status}.`),
  });
  const remove = useMutation({
    mutationFn: () => deleteMock(mock.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      router.push("/admin/mock-tests");
    },
  });

  const ids = mock.questions.map((r) => r.question_id);
  const move = (i: number, by: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    questions.mutate(next);
  };
  const failure = save.error ?? questions.error ?? status.error ?? remove.error;
  const busy = save.isPending || questions.isPending || status.isPending;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-700">
            <Link href="/admin/mock-tests">Mock Tests</Link> · {mock.exam.toUpperCase()}
          </p>
          <h1 className="text-[28px] font-bold">{mock.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            <Badge tone={statusTone[mock.status as keyof typeof statusTone] ?? "neutral"}>{mock.status}</Badge>
            {mock.question_count} questions · {mock.attempts} attempts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mock.status !== "published" && (
            <Button disabled={busy} onClick={() => status.mutate("published")}>
              Publish
            </Button>
          )}
          {mock.status === "published" && (
            <Button variant="secondary" disabled={busy} onClick={() => status.mutate("draft")}>
              Unpublish
            </Button>
          )}
          {mock.status !== "archived" && (
            <Button variant="secondary" disabled={busy} onClick={() => status.mutate("archived")}>
              Archive
            </Button>
          )}
          {mock.attempts === 0 && (
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => window.confirm(`Delete "${mock.title}"? This cannot be undone.`) && remove.mutate()}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {notice && !failure && (
        <p role="status" className="rounded-md bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          {notice}
        </p>
      )}
      {failure && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-danger">
          {problemText(failure)}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="font-bold">Details</h2>
        <MockFields value={form} onChange={setForm} examLocked />
        <div>
          <Button disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-bold">Questions in this paper</h2>
        <p className="px-5 pb-3 text-xs text-ink-3">Students see them in this order.</p>
        <table className="w-full min-w-[560px] text-sm">
          <tbody>
            {mock.questions.map((row, i) => (
              <tr key={row.question_id} className="border-t border-line">
                <td className="w-12 px-5 py-3 font-bold">{row.position}</td>
                <td className="px-3 py-3">
                  <Link href={`/admin/questions/${row.question_id}`} className="line-clamp-2 hover:text-brand-700">
                    {row.text}
                  </Link>
                  <span className="text-xs text-ink-3">
                    {row.subject} · {row.difficulty}
                  </span>
                  {row.status !== "published" && (
                    <Badge tone="danger" className="ml-2">
                      {row.status}
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <button aria-label={`Move question ${row.position} up`} disabled={i === 0 || busy} onClick={() => move(i, -1)} className="p-1 text-ink-3 hover:text-ink disabled:opacity-30">
                    <ArrowUp size={16} />
                  </button>
                  <button aria-label={`Move question ${row.position} down`} disabled={i === mock.questions.length - 1 || busy} onClick={() => move(i, 1)} className="p-1 text-ink-3 hover:text-ink disabled:opacity-30">
                    <ArrowDown size={16} />
                  </button>
                  <button aria-label={`Remove question ${row.position}`} disabled={busy} onClick={() => questions.mutate(ids.filter((id) => id !== row.question_id))} className="p-1 text-ink-3 hover:text-danger disabled:opacity-30">
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {mock.questions.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-ink-3">No questions yet. Add some below.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Picker mock={mock} busy={busy} onAdd={(add) => questions.mutate([...ids, ...add])} />
    </div>
  );
}

export function MockBuilderRoute() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "mock", id], queryFn: () => getAdminMock(id) });
  if (isPending) return <p className="text-ink-3">Loading…</p>;
  if (error) return <LoadProblem error={error} retry={refetch} />;
  return <Builder key={`${data.id}-${data.status}-${data.updated_at}`} mock={data} />;
}
