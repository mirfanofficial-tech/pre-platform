"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/card";
import { formatPKR, listPayments, useSubscription, type Subscription } from "@/lib/billing";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Usage({ label, used, limit }: { label: string; used: number; limit: number | undefined }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-ink-3">{limit === undefined ? `${used} used · Unlimited` : `${used} / ${limit}`}</span>
      </div>
      <ProgressBar value={limit === undefined ? 0 : Math.min(100, Math.round((used / limit) * 100))} />
    </div>
  );
}

function Plan({ s }: { s: Subscription }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{s.plan_name}</h2>
          <Badge tone={s.premium ? "brand" : "neutral"}>Current</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-3">
          {s.premium && s.ends_at
            ? `Active until ${date(s.ends_at)}. It does not renew by itself.`
            : `${s.limits.mcq_per_month ?? "Unlimited"} practice MCQs and ${s.limits.mock_per_month ?? "unlimited"} mock tests every month.`}
        </p>
      </div>
      <ButtonLink href={s.premium ? "/pricing" : "/pricing"}>{s.premium ? "Extend Premium" : "Upgrade to Premium"}</ButtonLink>
    </Card>
  );
}

export function SubscriptionView() {
  const { data: s, isPending, error } = useSubscription();
  const payments = useQuery({ queryKey: ["payments"], queryFn: listPayments });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Subscription</h1>
        <p className="text-ink-3">Manage your plan and billing.</p>
      </div>
      {isPending && <p className="text-ink-3">Loading your plan…</p>}
      {error && <Card className="text-center text-ink-3">Could not load your subscription.</Card>}
      {s && (
        <>
          <Plan s={s} />
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold">This month’s usage</h2>
              <span className="text-xs text-ink-3">Resets on {date(s.resets_at)}</span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Usage label="Practice MCQs" used={s.usage.mcq_used} limit={s.limits.mcq_per_month} />
              <Usage label="Mock tests" used={s.usage.mock_used} limit={s.limits.mock_per_month} />
            </div>
          </Card>
        </>
      )}
      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-bold">Billing history</h2>
        {payments.data && payments.data.length > 0 ? (
          <table className="mt-3 w-full min-w-[480px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["Date", "Plan", "Amount", "Status"].map((h) => (
                  <th key={h} className="px-5 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.data.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-5 py-3">{date(p.paid_at ?? p.created_at)}</td>
                  <td className="px-5 py-3 font-medium">{p.plan_name}</td>
                  <td className="px-5 py-3">{formatPKR(p.amount_paisa)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={p.status === "paid" ? "brand" : p.status === "pending" ? "warning" : "neutral"}>
                      {p.status[0].toUpperCase() + p.status.slice(1)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 pb-5 pt-2 text-sm text-ink-3">
            {payments.isPending ? "Loading…" : "No payments yet. They will appear here after your first purchase."}
          </p>
        )}
      </Card>
    </div>
  );
}
