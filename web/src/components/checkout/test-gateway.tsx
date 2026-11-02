"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { completeTestPayment } from "@/lib/billing";

/** Stand-in for the JazzCash page while developing. The API refuses it in production. */
export function TestGateway() {
  const ref = useSearchParams().get("ref") ?? "";
  const router = useRouter();
  const finish = useMutation({
    mutationFn: (outcome: "success" | "failure") => completeTestPayment(ref, outcome),
    onSuccess: (payment) => router.replace(`/checkout/status?payment=${payment.id}`),
  });
  const unavailable = finish.error instanceof ApiError && finish.error.status === 404;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Test payment gateway</h1>
        <p className="text-ink-3">Development only. No real money moves.</p>
      </div>
      <Card className="text-sm text-ink-2">
        Payment reference <span className="font-mono">{ref || "—"}</span>
      </Card>
      {finish.isError && (
        <p role="alert" className="text-sm text-danger">
          {unavailable ? "The test gateway is not available on this server." : "Something went wrong. Try again."}
        </p>
      )}
      <div className="flex gap-3">
        <Button disabled={!ref || finish.isPending} onClick={() => finish.mutate("success")}>
          Pay successfully
        </Button>
        <Button variant="secondary" disabled={!ref || finish.isPending} onClick={() => finish.mutate("failure")}>
          Fail the payment
        </Button>
      </div>
    </div>
  );
}
