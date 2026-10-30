"use client";

import { useMemo, useState } from "react";
import { Bookmark, Download, Eye, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resources, type Resource } from "@/data/library";
import { cn } from "@/lib/utils";

const kinds = ["All resources", "Subject notes", "Study guides", "Formula sheets", "Vocabulary lists", "Past papers", "Saved"];
const subjects = ["All subjects", ...Array.from(new Set(resources.map((r) => r.subject)))];
const formats = ["All formats", "PDF", "Guide", "List"];
const selectClass = "h-11 rounded-md border border-line-strong bg-white px-3 text-sm";

export default function MaterialsPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All resources");
  const [subject, setSubject] = useState("All subjects");
  const [format, setFormat] = useState("All formats");
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(resources.map((r) => [r.id, !!r.saved])),
  );
  const [notice, setNotice] = useState("");

  const list = useMemo(
    () =>
      resources.filter(
        (r: Resource) =>
          (kind === "All resources" || (kind === "Saved" ? saved[r.id] : r.kind === kind)) &&
          (subject === "All subjects" || r.subject === subject) &&
          (format === "All formats" || r.format === format) &&
          `${r.title} ${r.blurb}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, kind, subject, format, saved],
  );
  const savedCount = Object.values(saved).filter(Boolean).length;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-semibold text-ink-3">Study materials</h1>
        <Badge tone="neutral" className="px-3 py-1.5">
          <Bookmark size={12} /> Saved resources ({savedCount})
        </Badge>
      </div>
      <div>
        <h2 className="text-[28px] font-bold">LAT resource library</h2>
        <p className="mt-1 max-w-[760px] text-ink-3">
          Notes, guides, formula sheets and vocabulary lists prepared by subject teachers. Past papers appear here only
          where they are publicly and legally available.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search resources"
            placeholder="Search notes, guides and formula sheets"
            className="h-11 w-full rounded-md border border-line-strong bg-white pl-10 pr-4 text-sm"
          />
        </div>
        <select aria-label="Subject" className={selectClass} value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Format" className={selectClass} value={format} onChange={(e) => setFormat(e.target.value)}>
          {formats.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Sort" className={selectClass} defaultValue="recent">
          <option value="recent">Recently added</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium",
              kind === k ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-white text-ink-2",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-md bg-info-bg px-4 py-2.5 text-sm text-info">
          {notice}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <Badge tone={r.format === "PDF" ? "danger" : r.format === "Guide" ? "info" : "warning"}>{r.format}</Badge>
              <button
                aria-label={saved[r.id] ? "Remove from saved" : "Save resource"}
                aria-pressed={saved[r.id]}
                onClick={() => setSaved((s) => ({ ...s, [r.id]: !s[r.id] }))}
                className="text-ink-3 hover:text-brand-700"
              >
                <Bookmark size={18} className={saved[r.id] ? "fill-brand-600 text-brand-600" : ""} />
              </button>
            </div>
            <h3 className="font-bold leading-snug">{r.title}</h3>
            <p className="text-[13px] leading-relaxed text-ink-2">{r.blurb}</p>
            <div className="mt-auto flex items-center justify-between pt-1">
              <Badge tone="neutral">{r.subject}</Badge>
              <span className="text-xs text-ink-3">{r.meta}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setNotice("Previews are not connected in this demo.")}>
                <Eye size={14} /> Preview
              </Button>
              <Button size="sm" onClick={() => setNotice("Downloads are not connected in this demo.")}>
                <Download size={14} /> Download
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {list.length === 0 && <Card className="text-center text-ink-3">No resources match your filters.</Card>}

      <p className="flex items-start gap-2 rounded-md bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={16} className="mt-0.5 shrink-0" />
        Past papers are published only where the examining body permits redistribution. Everything else in this library
        is original PrepMaster material.
      </p>
    </div>
  );
}
