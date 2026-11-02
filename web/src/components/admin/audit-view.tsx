"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { LoadProblem } from "@/components/admin/common";
import { listAudit } from "@/lib/admin";

export function AuditView() {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["admin", "audit"], queryFn: listAudit });
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Audit log</h1>
        <p className="text-ink-3">The latest 100 admin actions: who did what, and when.</p>
      </div>
      {isPending && <p className="text-ink-3">Loading…</p>}
      {error && <LoadProblem error={error} retry={refetch} />}
      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["When", "Who", "Action", "Item"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-5 py-3 text-ink-2">
                    {new Date(a.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3">{a.actor ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{a.action}</td>
                  <td className="px-5 py-3 font-mono text-xs text-ink-3">
                    {a.entity} {a.entity_id?.slice(0, 8)}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-ink-3">
                    No actions recorded yet.
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
