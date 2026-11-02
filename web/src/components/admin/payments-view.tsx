"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, Pager, problemText, shortDate } from "@/components/admin/common";
import { listAdminPayments, refundPayment } from "@/lib/admin";
import { formatPKR } from "@/lib/billing";

const PAGE_SIZE = 20;
const tone = { paid: "brand", pending: "warning", failed: "neutral", refunded: "danger" } as const;

export function PaymentsView() {
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["admin", "payments", { status, page }],
    queryFn: () => listAdminPayments({ status, page }),
    placeholderData: (previous) => previous,
  });
  const refund = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Payments</h1>
        <p className="text-ink-3">
          A refund here ends the student’s Premium. It does not send money back: refund the customer in the JazzCash
          merchant portal as well.
        </p>
      </div>
      <select
        aria-label="Status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="h-11 w-fit rounded-md border border-line-strong bg-white px-3 text-sm"
      >
        <option value="">Any status</option>
        {["paid", "pending", "failed", "refunded"].map((s) => (
          <option key={s} value={s}>
            {s[0].toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>

      {refund.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-danger">
          {problemText(refund.error)}
        </p>
      )}

      {error && !data ? (
        <LoadProblem error={error} retry={refetch} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["Date", "Student", "Plan", "Amount", "Reference", "Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-ink-3">
                    Loading…
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-5 py-3.5 text-ink-2">{shortDate(p.paid_at ?? p.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{p.student}</p>
                    <p className="text-xs text-ink-3">{p.email}</p>
                  </td>
                  <td className="px-5 py-3.5">{p.plan}</td>
                  <td className="px-5 py-3.5 font-medium">{formatPKR(p.amount_paisa)}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink-3">{p.provider_ref}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={tone[p.status as keyof typeof tone] ?? "neutral"}>{p.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {p.status === "paid" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={refund.isPending}
                        onClick={() => {
                          if (window.confirm(`Mark ${formatPKR(p.amount_paisa)} from ${p.student} as refunded and end their Premium?`))
                            refund.mutate(p.id);
                        }}
                      >
                        Refund
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-ink-3">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />}
        </Card>
      )}
    </div>
  );
}
