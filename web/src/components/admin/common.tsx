"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";

/** Shown when a list cannot load; a 403 means this role may not open the page. */
export function LoadProblem({ error, retry }: { error: unknown; retry?: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Card className="text-center">
      <p className="font-semibold">{forbidden ? "You do not have access to this page" : "Could not load this page"}</p>
      <p className="mt-1 text-sm text-ink-3">
        {forbidden ? "It is only available to a higher staff role." : "Check your connection and try again."}
      </p>
      {!forbidden && retry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function problemText(error: unknown, fallback = "Something went wrong. Try again.") {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return fallback;
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-ink-3">
      <span>
        Showing {from}–{to} of {total.toLocaleString("en-GB")}
      </span>
      <span className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </span>
    </div>
  );
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
