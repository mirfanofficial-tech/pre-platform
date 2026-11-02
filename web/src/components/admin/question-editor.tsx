"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, problemText } from "@/components/admin/common";
import {
  createQuestion,
  getAdminQuestion,
  transitionQuestion,
  updateQuestion,
  type AdminQuestion,
  type QuestionBody,
} from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { getExam, listExams } from "@/lib/exam";
import { cn } from "@/lib/utils";

const MAX = 2000;
const selectClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";
const letters = "ABCDEF";
const statusLabel: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium">
      {children}
    </label>
  );
}

type Draft = {
  exam: string;
  subjectId: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  text: string;
  options: string[];
  correct: number;
  explanation: string;
};

const blank: Draft = {
  exam: "lat",
  subjectId: "",
  topic: "",
  difficulty: "medium",
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  explanation: "",
};

const fromQuestion = (q: AdminQuestion): Draft => ({
  exam: q.exam,
  subjectId: q.subject_id,
  topic: q.topic ?? "",
  difficulty: q.difficulty as Draft["difficulty"],
  text: q.text,
  options: q.options.map((o) => o.text),
  correct: Math.max(0, q.options.findIndex((o) => o.is_correct)),
  explanation: q.explanation,
});

function Form({ initial, question }: { initial: Draft; question: AdminQuestion | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const role = useMe().data?.role ?? "";
  const [d, setD] = useState(initial);
  const [notice, setNotice] = useState("");

  const exams = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const exam = useQuery({ queryKey: ["exam", d.exam], queryFn: () => getExam(d.exam) });
  const subjects = exam.data?.subjects.filter((s) => s.kind === "mcq") ?? [];
  const subjectId = subjects.some((s) => s.id === d.subjectId) ? d.subjectId : (subjects[0]?.id ?? "");

  const status = question?.status ?? "draft";
  const locked = status === "archived" || (status === "published" && role === "editor");
  const valid = d.text.trim() !== "" && d.options.filter((o) => o.trim()).length >= 2 && !!subjectId;

  const body = (): QuestionBody => {
    const kept = d.options.map((text, i) => ({ text: text.trim(), i })).filter((o) => o.text);
    return {
      exam: d.exam,
      subject_id: subjectId,
      topic_name: d.topic.trim() || null,
      text: d.text.trim(),
      options: kept.map((o) => o.text),
      correct_index: Math.max(0, kept.findIndex((o) => o.i === d.correct)),
      explanation: d.explanation.trim(),
      difficulty: d.difficulty,
    };
  };

  const refresh = (saved: AdminQuestion) => {
    client.setQueryData(["admin", "question", saved.id], saved);
    void client.invalidateQueries({ queryKey: ["admin", "questions"] });
    void client.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const save = useMutation({
    mutationFn: () => (question ? updateQuestion(question.id, body()) : createQuestion(body())),
    onSuccess: (saved) => {
      refresh(saved);
      if (!question) router.replace(`/admin/questions/${saved.id}`);
      else setNotice("Saved.");
    },
  });
  const move = useMutation({
    mutationFn: (to: string) => transitionQuestion(question!.id, to),
    onSuccess: (saved) => {
      refresh(saved);
      setNotice(`Now ${statusLabel[saved.status].toLowerCase()}.`);
    },
  });
  const failure = save.error ?? move.error;
  const busy = save.isPending || move.isPending;
  const canReview = role === "reviewer" || role === "admin";

  const actions: [string, string, "primary" | "secondary"][] = [];
  if (question) {
    if (status === "draft") {
      actions.push(["in_review", "Submit for review", "secondary"]);
      if (role === "admin") actions.push(["published", "Publish now", "primary"]);
    }
    if (status === "in_review" && canReview) {
      actions.push(["published", "Approve and publish", "primary"], ["draft", "Send back to draft", "secondary"]);
    }
    if (status === "published" && canReview) actions.push(["archived", "Archive", "secondary"]);
    if (status === "archived" && role === "admin") actions.push(["draft", "Restore as draft", "secondary"]);
  }

  const set = (patch: Partial<Draft>) => {
    setNotice("");
    setD((p) => ({ ...p, ...patch }));
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-700">Question Bank · {d.exam.toUpperCase()}</p>
          <h1 className="text-[28px] font-bold">{question ? "Edit MCQ" : "Create new MCQ"}</h1>
          {question && (
            <p className="mt-1 flex items-center gap-2 text-xs text-ink-3">
              <Badge tone={status === "published" ? "brand" : status === "in_review" ? "warning" : "neutral"}>
                {statusLabel[status]}
              </Badge>
              Version {question.version}
              {question.created_by && ` · written by ${question.created_by}`}
              {question.reviewed_by && ` · approved by ${question.reviewed_by}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="ghost" onClick={() => router.push("/admin/questions")}>
            Back to list
          </Button>
          {actions.map(([to, label, variant]) => (
            <Button key={to} variant={variant} disabled={busy} onClick={() => move.mutate(to)}>
              {label}
            </Button>
          ))}
          {!locked && (
            <Button disabled={!valid || busy} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : question ? "Save changes" : "Save as draft"}
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
      {locked && (
        <p className="rounded-md bg-surface-neutral px-4 py-2.5 text-sm text-ink-2">
          {status === "archived"
            ? "This question is archived. An admin can restore it as a draft."
            : "Published questions can only be changed by a reviewer or admin."}
        </p>
      )}

      <fieldset disabled={locked} className="grid min-w-0 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="font-bold">Question details</h2>
            <div className="flex items-center justify-between">
              <Label htmlFor="qtext">Question text</Label>
              <span className="text-xs text-ink-3">
                {d.text.length} / {MAX} characters
              </span>
            </div>
            <textarea
              id="qtext"
              value={d.text}
              maxLength={MAX}
              onChange={(e) => set({ text: e.target.value })}
              rows={4}
              className="rounded-md border border-line-strong p-3.5 text-sm"
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="font-bold">Answer options</h2>
              <p className="text-xs text-ink-3">Select the correct answer. Between 2 and 6 options.</p>
            </div>
            {d.options.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct"
                  checked={d.correct === i}
                  onChange={() => set({ correct: i })}
                  aria-label={`Option ${letters[i]} is correct`}
                />
                <span className="w-5 text-sm font-bold">{letters[i]}</span>
                <input
                  value={o}
                  aria-label={`Option ${letters[i]}`}
                  onChange={(e) => set({ options: d.options.map((v, j) => (j === i ? e.target.value : v)) })}
                  className={cn(
                    "h-11 min-w-0 flex-1 rounded-md border px-3.5 text-sm",
                    d.correct === i ? "border-brand-600 bg-brand-50" : "border-line-strong",
                  )}
                />
                {d.options.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove option ${letters[i]}`}
                    onClick={() =>
                      set({
                        options: d.options.filter((_, j) => j !== i),
                        correct: d.correct === i ? 0 : d.correct > i ? d.correct - 1 : d.correct,
                      })
                    }
                    className="text-ink-3 hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {d.options.length < 6 && (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => set({ options: [...d.options, ""] })}>
                <Plus size={16} /> Add another option
              </Button>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="font-bold">Answer explanation</h2>
            <p className="text-xs text-ink-3">Shown to students after they answer</p>
            <textarea
              value={d.explanation}
              onChange={(e) => set({ explanation: e.target.value })}
              aria-label="Answer explanation"
              rows={4}
              className="rounded-md border border-line-strong p-3.5 text-sm"
            />
          </Card>
        </div>

        <Card className="flex h-fit flex-col gap-4">
          <h2 className="font-bold">Classification</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam">Exam</Label>
            <select
              id="exam"
              className={selectClass}
              value={d.exam}
              disabled={!!question}
              onChange={(e) => set({ exam: e.target.value, subjectId: "" })}
            >
              {exams.data?.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <select id="subject" className={selectClass} value={subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic">Topic (optional)</Label>
            <input
              id="topic"
              value={d.topic}
              maxLength={160}
              onChange={(e) => set({ topic: e.target.value })}
              placeholder="For example Tenses"
              className={selectClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Difficulty</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Difficulty">
              {(["easy", "medium", "hard"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set({ difficulty: level })}
                  aria-pressed={d.difficulty === level}
                  className={cn(
                    "h-10 rounded-md border text-sm font-medium capitalize",
                    d.difficulty === level ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-strong",
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </fieldset>
    </div>
  );
}

export function QuestionEditor({ id }: { id?: string }) {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["admin", "question", id],
    queryFn: () => getAdminQuestion(id!),
    enabled: !!id,
  });
  if (!id) return <Form initial={blank} question={null} />;
  if (isPending) return <p className="text-ink-3">Loading the question…</p>;
  if (error) return <LoadProblem error={error} retry={refetch} />;
  return <Form key={`${data.id}-${data.version}-${data.status}`} initial={fromQuestion(data)} question={data} />;
}

export function QuestionEditorRoute() {
  const { id } = useParams<{ id: string }>();
  return <QuestionEditor id={id} />;
}
