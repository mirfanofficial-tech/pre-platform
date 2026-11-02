"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { problemText } from "@/components/admin/common";
import { IMPORT_TEMPLATE, importQuestions, type ImportResult } from "@/lib/admin";
import { listExams } from "@/lib/exam";

const selectClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";

export function ImportView() {
  const client = useQueryClient();
  const exams = useQuery({ queryKey: ["exams"], queryFn: listExams });
  const [exam, setExam] = useState("lat");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [checked, setChecked] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => importQuestions(exam, file!.text, dryRun),
    onSuccess: (result) => {
      setChecked(result);
      if (!result.dry_run) {
        void client.invalidateQueries({ queryKey: ["admin"] });
      }
    },
  });

  const ready = checked?.dry_run && checked.errors.length === 0 && checked.created > 0;
  const finished = checked && !checked.dry_run && checked.errors.length === 0;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <div>
        <p className="text-xs font-semibold text-brand-700">
          <Link href="/admin/questions">Question Bank</Link>
        </p>
        <h1 className="text-[28px] font-bold">Import questions from CSV</h1>
        <p className="text-ink-3">
          Questions are added as drafts and go through review before students see them. If any row has a problem,
          nothing is imported.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="exam" className="text-[13px] font-medium">
              Exam
            </label>
            <select
              id="exam"
              className={selectClass}
              value={exam}
              onChange={(e) => {
                setExam(e.target.value);
                setChecked(null);
              }}
            >
              {exams.data?.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <label htmlFor="csv" className="text-[13px] font-medium">
              CSV file (up to 1,000 rows, 2 MB)
            </label>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setChecked(null);
                run.reset();
                setFile(f ? { name: f.name, text: await f.text() } : null);
              }}
            />
          </div>
        </div>

        <p className="text-sm text-ink-3">
          Columns: <code>subject, topic, difficulty, question, option_a … option_f, correct, explanation</code>. The
          subject must already exist for the exam; <code>correct</code> is the option letter.{" "}
          <a
            className="font-semibold text-brand-700"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`}
            download="questions-template.csv"
          >
            Download a template
          </a>
        </p>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={!file || run.isPending} onClick={() => run.mutate(true)}>
            {run.isPending && run.variables ? "Checking…" : "Check file"}
          </Button>
          <Button disabled={!ready || run.isPending} onClick={() => run.mutate(false)}>
            {ready ? `Import ${checked.created} questions` : "Import"}
          </Button>
        </div>
      </Card>

      {run.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-danger">
          {problemText(run.error)}
        </p>
      )}

      {checked && checked.errors.length === 0 && (
        <p role="status" className="rounded-md bg-brand-50 px-4 py-3 text-sm text-brand-900">
          {finished
            ? `Imported ${checked.created} questions as drafts.`
            : `The file looks good: ${checked.created} new questions would be added.`}{" "}
          {checked.duplicates > 0 && `${checked.duplicates} duplicates were skipped. `}
          {finished && (
            <Link href="/admin/questions?status=draft" className="font-semibold underline">
              Open the drafts
            </Link>
          )}
        </p>
      )}

      {checked && checked.errors.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <p className="px-5 py-4 font-semibold">
            {checked.errors.length} {checked.errors.length === 1 ? "row needs" : "rows need"} fixing. Nothing was imported.
          </p>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                <th className="px-5 py-2.5 font-medium">Row</th>
                <th className="px-5 py-2.5 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody>
              {checked.errors.map((e) => (
                <tr key={e.row} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium">{e.row}</td>
                  <td className="px-5 py-2.5">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
