"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { formatPKR, goToGateway, periodLabel, startCheckout, useSubscription, useVisiblePlans } from "@/lib/billing";

export function CheckoutForm() {
  const code = useSearchParams().get("plan") ?? "premium_monthly";
  const { data: plans, isPending, error } = useVisiblePlans();
  const subscription = useSubscription().data;
  const plan = plans?.find((p) => p.code === code && p.price_paisa > 0);

  const pay = useMutation({
    mutationFn: () => startCheckout(code),
    onSuccess: goToGateway,
  });

  if (isPending) return <p className="text-ink-3">Loading…</p>;
  if (error || !plan) {
    return (
      <div className="text-center">
        <h1 className="text-[28px] font-bold">Plan not found</h1>
        <p className="mt-2 text-ink-3">That plan is not available. Choose one from the pricing page.</p>
        <ButtonLink href="/pricing" className="mt-6">
          See plans
        </ButtonLink>
      </div>
    );
  }

  const failure = pay.error instanceof ApiError ? pay.error : null;
  const unverified = failure?.code === "email_not_verified";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        pay.mutate();
      }}
    >
      <div>
        <h1 className="text-[28px] font-bold">Checkout</h1>
        <p className="text-ink-3">Complete your upgrade.</p>
      </div>
      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="font-bold">{plan.name}</p>
          <p className="text-xs text-ink-3">
            {plan.period_days} days of Premium · one payment, no auto-renewal
          </p>
        </div>
        <p className="text-xl font-extrabold">
          {formatPKR(plan.price_paisa)}
          <span className="text-xs font-medium text-ink-3"> / {periodLabel(plan.period_days)}</span>
        </p>
      </Card>
      {subscription?.premium && subscription.ends_at && (
        <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-900">
          You already have Premium until {new Date(subscription.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          Paying now adds {plan.period_days} days after that.
        </p>
      )}
      <div className="flex items-start gap-3 rounded-md border border-line p-4 text-sm">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" />
        <p className="text-ink-2">
          You will pay on JazzCash’s secure page with your JazzCash mobile account or a card. PrepMaster never sees
          your wallet PIN or card number.
        </p>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-danger">
          {failure.problem.detail ?? failure.problem.title}
          {unverified && (
            <>
              {" "}
              <Link href="/dashboard" className="font-semibold underline">
                Go to dashboard
              </Link>
            </>
          )}
        </p>
      )}
      {pay.isError && !failure && (
        <p role="alert" className="text-sm text-danger">
          Could not reach the server. Try again.
        </p>
      )}
      <Button type="submit" size="lg" disabled={pay.isPending || pay.isSuccess}>
        {pay.isPending || pay.isSuccess ? "Taking you to JazzCash…" : `Pay ${formatPKR(plan.price_paisa)} with JazzCash`}
      </Button>
      <Link href="/pricing" className="text-center text-sm text-ink-3 hover:text-ink">
        ← Back to pricing
      </Link>
    </form>
  );
}
