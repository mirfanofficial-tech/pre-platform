"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { getPayment, SUBSCRIPTION_KEY } from "@/lib/billing";

const POLL_MS = 2000;
const GIVE_UP_AFTER_POLLS = 30;

/** Shown after the gateway sends the shopper back. The server decides the outcome. */
export function PaymentStatus() {
  const id = useSearchParams().get("payment") ?? "";
  const client = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => getPayment(id),
    enabled: id !== "",
    refetchInterval: (q) =>
      q.state.data?.status === "pending" && q.state.dataUpdateCount < GIVE_UP_AFTER_POLLS ? POLL_MS : false,
  });

  useEffect(() => {
    if (data?.status === "paid") void client.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
  }, [data?.status, client]);

  if (!id || error) {
    return (
      <div className="text-center">
        <XCircle size={48} className="mx-auto text-danger" />
        <h1 className="mt-4 text-[28px] font-bold">We could not find that payment</h1>
        <ButtonLink href="/subscription" className="mt-6">
          Go to subscription
        </ButtonLink>
      </div>
    );
  }
  if (!data) return <p className="text-ink-3">Checking your payment…</p>;

  if (data.status === "paid") {
    return (
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-brand-600" />
        <h1 className="mt-4 text-[28px] font-bold">Payment successful</h1>
        <p className="mt-2 text-ink-3">{data.plan_name} is now active on your account.</p>
        <ButtonLink href="/dashboard" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }
  if (data.status === "pending") {
    const waitedLong = (client.getQueryState(["payment", id])?.dataUpdateCount ?? 0) >= GIVE_UP_AFTER_POLLS;
    return (
      <div className="text-center">
        <Clock size={48} className="mx-auto text-warning" />
        <h1 className="mt-4 text-[28px] font-bold">{waitedLong ? "Still waiting for confirmation" : "Confirming your payment…"}</h1>
        <p className="mt-2 text-ink-3">
          {waitedLong
            ? "JazzCash has not confirmed yet. If money left your account it will be applied automatically; check Subscription in a few minutes."
            : "This usually takes a few seconds. Please do not close this page."}
        </p>
        <ButtonLink href="/subscription" variant="secondary" className="mt-6">
          Go to subscription
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="text-center">
      <XCircle size={48} className="mx-auto text-danger" />
      <h1 className="mt-4 text-[28px] font-bold">Payment not completed</h1>
      <p className="mt-2 text-ink-3">No money was taken, or the payment was declined. You can try again.</p>
      <ButtonLink href="/pricing" className="mt-6">
        Back to plans
      </ButtonLink>
    </div>
  );
}
