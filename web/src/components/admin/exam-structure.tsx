"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExamFields } from "@/components/admin/exams-admin";
import { LoadProblem, problemText } from "@/components/admin/common";
import {
  createSubject,
  createTopic,
  deleteSubject,
  deleteTopic,
  getStructure,
  renameTopic,
  updateExam,
  updateSubject,
  type ExamBody,
  type ExamStructure,
  type SubjectAdmin,
} from "@/lib/admin";
import { useMe } from "@/lib/auth";

const inputClass = "h-10 min-w-0 rounded-md border border-line-strong bg-white px-3 text-sm";

function TopicRow({ topic, canEdit, run }: { topic: SubjectAdmin["topics"][number]; canEdit: boolean; run: (job: () => Promise<unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      {editing ? (
        <>
          <input aria-label={`Rename ${topic.name}`} className={inputClass} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
          <Button
            size="sm"
            disabled={!name.trim() || name.trim() === topic.name}
            onClick={() => {
              run(() => renameTopic(topic.id, name.trim()));
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm">{topic.name}</span>
          <span className="text-xs text-ink-3">{topic.question_count} questions</span>
          {canEdit && (
            <>
              <button aria-label={`Rename ${topic.name}`} className="text-ink-3 hover:text-ink" onClick={() => setEditing(true)}>
                <Pencil size={14} />
              </button>
              {topic.question_count === 0 && (
                <button
                  aria-label={`Delete ${topic.name}`}
                  className="text-ink-3 hover:text-danger"
                  onClick={() => window.confirm(`Delete the topic "${topic.name}"?`) && run(() => deleteTopic(topic.id))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </>
      )}
    </li>
  );
}

function SubjectCard({ subject, isAdmin, canTopics, run }: { subject: SubjectAdmin; isAdmin: boolean; canTopics: boolean; run: (job: () => Promise<unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [topic, setTopic] = useState("");
  const body = { name: name.trim(), kind: subject.kind as "mcq" | "written", sort: subject.sort };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <input aria-label="Subject name" className={inputClass} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={() => {
                run(() => updateSubject(subject.id, body));
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <h3 className="font-bold">{subject.name}</h3>
            <Badge tone={subject.kind === "mcq" ? "brand" : "info"}>{subject.kind === "mcq" ? "MCQs" : "Written"}</Badge>
            <span className="text-xs text-ink-3">{subject.question_count} questions</span>
            {isAdmin && (
              <>
                <button aria-label={`Rename ${subject.name}`} className="text-ink-3 hover:text-ink" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                </button>
                {subject.question_count === 0 && (
                  <button
                    aria-label={`Delete ${subject.name}`}
                    className="text-ink-3 hover:text-danger"
                    onClick={() => window.confirm(`Delete the subject "${subject.name}" and its topics?`) && run(() => deleteSubject(subject.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      {subject.kind === "mcq" && (
        <>
          <ul className="divide-y divide-line">
            {subject.topics.map((t) => (
              <TopicRow key={t.id} topic={t} canEdit={canTopics} run={run} />
            ))}
            {subject.topics.length === 0 && <li className="py-1.5 text-sm text-ink-3">No topics yet.</li>}
          </ul>
          {canTopics && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!topic.trim()) return;
                run(() => createTopic(subject.id, topic.trim()));
                setTopic("");
              }}
            >
              <input aria-label={`New topic in ${subject.name}`} className={`${inputClass} flex-1`} placeholder="Add a topic" value={topic} maxLength={160} onChange={(e) => setTopic(e.target.value)} />
              <Button size="sm" variant="secondary" type="submit" disabled={!topic.trim()}>
                Add topic
              </Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

function Editor({ data }: { data: ExamStructure }) {
  const client = useQueryClient();
  const role = useMe().data?.role;
  const isAdmin = role === "admin";
  const canTopics = role === "admin" || role === "reviewer";
  const { exam } = data;
  const [form, setForm] = useState<ExamBody>({
    slug: exam.slug,
    name: exam.name,
    full_name: exam.full_name,
    category: exam.category,
    description: exam.description,
    access: exam.access,
    status: exam.status,
    sort: exam.sort,
  });
  const [subjectName, setSubjectName] = useState("");
  const [subjectKind, setSubjectKind] = useState<"mcq" | "written">("mcq");
  const [notice, setNotice] = useState("");

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin"] });
    void client.invalidateQueries({ queryKey: ["exams"] });
    void client.invalidateQueries({ queryKey: ["exam"] });
  };
  const job = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => {
      setNotice("");
      refresh();
    },
  });
  const save = useMutation({
    mutationFn: () => updateExam(exam.slug, form),
    onSuccess: () => {
      setNotice("Saved.");
      refresh();
    },
  });
  const failure = job.error ?? save.error;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <div>
        <p className="text-xs font-semibold text-brand-700">
          <Link href="/admin/exams">Exams &amp; Subjects</Link>
        </p>
        <h1 className="text-[28px] font-bold">{exam.name}</h1>
        <p className="text-ink-3">
          {exam.question_count} questions · {exam.mock_count} mock tests
        </p>
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
        <fieldset disabled={!isAdmin} className="contents">
          <ExamFields value={form} onChange={setForm} slugLocked />
        </fieldset>
        {isAdmin ? (
          <div>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save details"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-3">Only admins can change exam details.</p>
        )}
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Subjects and topics</h2>
        {data.subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} isAdmin={isAdmin} canTopics={canTopics} run={(fn) => job.mutate(fn)} />
        ))}
        {data.subjects.length === 0 && <Card className="text-center text-ink-3">No subjects yet.</Card>}
        {isAdmin && (
          <Card>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!subjectName.trim()) return;
                job.mutate(() => createSubject(exam.slug, { name: subjectName.trim(), kind: subjectKind, sort: data.subjects.length + 1 }));
                setSubjectName("");
              }}
            >
              <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-[13px] font-medium">
                New subject
                <input className={inputClass} value={subjectName} maxLength={120} onChange={(e) => setSubjectName(e.target.value)} placeholder="For example Pakistan Studies" />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Type
                <select className={inputClass} value={subjectKind} onChange={(e) => setSubjectKind(e.target.value as "mcq" | "written")}>
                  <option value="mcq">MCQs</option>
                  <option value="written">Written (guides)</option>
                </select>
              </label>
              <Button type="submit" disabled={!subjectName.trim() || job.isPending}>
                Add subject
              </Button>
            </form>
          </Card>
        )}
      </section>
    </div>
  );
}

export function ExamStructureView() {
  const { slug } = useParams<{ slug: string }>();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "structure", slug], queryFn: () => getStructure(slug) });
  if (isPending) return <p className="text-ink-3">Loading…</p>;
  if (error) return <LoadProblem error={error} retry={refetch} />;
  return <Editor key={JSON.stringify(data.exam)} data={data} />;
}
