"use client";

import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPKR, periodLabel, useSubscription, useVisiblePlans } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function PlanCards() {
  const { data: plans, isPending, error, refetch } = useVisiblePlans();
  const current = useSubscription().data?.plan_code;

  if (isPending) return <p className="text-center text-ink-3">Loading plans…</p>;
  if (error) {
    return (
      <Card className="mx-auto max-w-[420px] text-center">
        <p className="text-ink-3">Could not load the plans.</p>
        <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => refetch()}>
          Try again
        </button>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-6 md:grid-cols-3">
      {plans.map((p) => {
        const highlight = p.badge === "Most popular";
        const free = p.price_paisa === 0;
        const isCurrent = current === p.code;
        return (
          <div
            key={p.code}
            className={cn(
              "flex flex-col rounded-lg border bg-white p-7",
              highlight ? "border-brand-600 shadow-[0_8px_30px_rgba(5,150,105,0.15)]" : "border-line",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold">{p.name}</h3>
              {p.badge && <Badge tone={highlight ? "brand" : "neutral"}>{p.badge}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-3">{p.blurb}</p>
            <p className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight">{formatPKR(p.price_paisa)}</span>
              <span className="text-sm text-ink-3">/ {periodLabel(p.period_days)}</span>
            </p>
            {isCurrent ? (
              <p className="mt-6 rounded-md bg-surface-neutral py-2.5 text-center text-sm font-semibold text-ink-2">
                Your current plan
              </p>
            ) : (
              <ButtonLink
                href={free ? "/register" : `/checkout?plan=${p.code}`}
                variant={highlight ? "primary" : "secondary"}
                className="mt-6"
              >
                {free ? "Start for free" : "Go Premium"}
              </ButtonLink>
            )}
            <hr className="my-6 border-line" />
            <ul className="flex flex-col gap-3 text-sm text-ink-2">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
