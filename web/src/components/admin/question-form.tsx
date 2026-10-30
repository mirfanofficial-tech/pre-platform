"use client";

import { useState } from "react";
import { Plus, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MAX = 600;
const selectClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium">
      {children}
    </label>
  );
}

export function QuestionForm() {
  const [text, setText] = useState(
    "The Objectives Resolution, which later became a substantive part of the Constitution of Pakistan, was passed by the Constituent Assembly in which year?",
  );
  const [options, setOptions] = useState(["1947", "1949", "1956", "1962"]);
  const [correct, setCorrect] = useState(1);
  const [explanation, setExplanation] = useState(
    "The Objectives Resolution was passed on 12 March 1949 under Prime Minister Liaquat Ali Khan. It was later incorporated as a substantive part of the Constitution through Article 2A in 1985.",
  );
  const [difficulty, setDifficulty] = useState("Easy");
  const [tags, setTags] = useState(["1949", "Objectives Resolution"]);
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState("Published");
  const [notice, setNotice] = useState("");

  const valid = text.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;
  const save = (label: string) => setNotice(valid ? label : "Add question text and at least two options first.");

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-700">Question Bank · LAT</p>
          <h1 className="text-[28px] font-bold">Create new MCQ</h1>
          <p className="text-xs text-ink-3">Draft saved 2 minutes ago</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="ghost" onClick={() => setNotice("")}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save("Saved as draft.")}>
            Save as draft
          </Button>
          <Button onClick={() => save("Question published.")}>Publish question</Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-md bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="font-bold">Question details</h2>
            <div className="flex items-center justify-between">
              <Label htmlFor="qtext">Question text</Label>
              <span className="text-xs text-ink-3">
                {text.length} / {MAX} characters
              </span>
            </div>
            <textarea
              id="qtext"
              value={text}
              maxLength={MAX}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="rounded-md border border-line-strong p-3.5 text-sm"
            />
            <div className="flex flex-col items-center gap-1 rounded-md border-2 border-dashed border-line-strong p-5 text-center">
              <Upload size={20} className="text-ink-3" />
              <p className="text-sm font-medium">Drag an image here or browse files</p>
              <p className="text-xs text-ink-3">PNG or JPG up to 2 MB. Use for diagrams, passages or figure-based questions.</p>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="font-bold">Answer options</h2>
              <p className="text-xs text-ink-3">Select the correct answer</p>
            </div>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct"
                  checked={correct === i}
                  onChange={() => setCorrect(i)}
                  aria-label={`Option ${"ABCDEF"[i]} is correct`}
                />
                <span className="w-5 text-sm font-bold">{"ABCDEF"[i]}</span>
                <input
                  value={o}
                  aria-label={`Option ${"ABCDEF"[i]}`}
                  onChange={(e) => setOptions((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
                  className={cn(
                    "h-11 min-w-0 flex-1 rounded-md border px-3.5 text-sm",
                    correct === i ? "border-brand-600 bg-brand-50" : "border-line-strong",
                  )}
                />
                {correct === i && <Badge className="max-sm:hidden">Correct answer</Badge>}
                {options.length > 2 && (
                  <button
                    aria-label={`Remove option ${"ABCDEF"[i]}`}
                    onClick={() => {
                      setOptions((p) => p.filter((_, j) => j !== i));
                      setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
                    }}
                    className="text-ink-3 hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setOptions((p) => [...p, ""])}>
                <Plus size={16} /> Add another option
              </Button>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="font-bold">Answer explanation</h2>
            <p className="text-xs text-ink-3">Shown to students after they answer</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              aria-label="Answer explanation"
              rows={4}
              className="rounded-md border border-line-strong p-3.5 text-sm"
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-bold">Bulk import questions</h2>
            <p className="text-sm text-ink-3">
              Upload a CSV or XLSX file to add many questions at once. Each row needs question text, four options, the
              correct answer and an explanation.
            </p>
            <div className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-line-strong p-6 text-center">
              <p className="font-medium">Drop your file here</p>
              <p className="text-xs text-ink-3">CSV or XLSX up to 5 MB</p>
              <div className="flex gap-3">
                <Button variant="secondary" size="sm">
                  Download template
                </Button>
                <Button size="sm">Choose file</Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="font-bold">Classification</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam">Exam</Label>
              <select id="exam" className={selectClass} defaultValue="lat">
                <option value="lat">LAT — Law Admission Test</option>
                <option value="mdcat">MDCAT</option>
                <option value="ecat">ECAT</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <select id="subject" className={selectClass} defaultValue="gk">
                <option value="gk">General Knowledge</option>
                <option>English</option>
                <option>Mathematics</option>
                <option>Pakistan Studies</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic">Topic</Label>
              <select id="topic" className={selectClass}>
                <option>Constitutional History</option>
                <option>Current Affairs</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Difficulty">
                {["Easy", "Medium", "Hard"].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                    className={cn(
                      "h-10 rounded-md border text-[13px] font-semibold",
                      difficulty === d ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-strong",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                    <button aria-label={`Remove tag ${t}`} onClick={() => setTags((p) => p.filter((x) => x !== t))}>
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
              <input
                id="tags"
                value={tagInput}
                placeholder="Add tag…"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    setTags((p) => [...p, tagInput.trim()]);
                    setTagInput("");
                  }
                }}
                className={selectClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select id="status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Published</option>
                <option>Draft</option>
                <option>In review</option>
              </select>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 bg-surface-subtle">
            <h2 className="font-bold">Student preview</h2>
            <p className="text-sm">{text || "Question text appears here."}</p>
            {options.slice(0, 2).map((o, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-surface-neutral text-xs font-bold">
                  {"ABCDEF"[i]}
                </span>
                {o || "—"}
              </div>
            ))}
            {options.length > 2 && <p className="text-xs text-ink-3">+ {options.length - 2} more options</p>}
            {explanation && <p className="text-xs text-ink-3">Explanation is shown after answering.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
