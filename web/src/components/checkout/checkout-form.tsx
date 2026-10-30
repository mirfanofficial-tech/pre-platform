"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { formatPKR, plans } from "@/data/content";
import { paymentMethods } from "@/data/extra";
import { cn } from "@/lib/utils";

export function CheckoutForm() {
  const params = useSearchParams();
  const plan = plans.find((p) => p.id === params.get("plan")) ?? plans[1];
  const total = plan.price;
  const [method, setMethod] = useState("jazzcash");
  const [status, setStatus] = useState<"idle" | "paying" | "paid">("idle");

  if (status === "paid") {
    return (
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-brand-600" />
        <h1 className="mt-4 text-[28px] font-bold">Payment successful</h1>
        <p className="mt-2 text-ink-3">
          {plan.name} is now active. This is a demo checkout — no money was charged.
        </p>
        <ButtonLink href="/dashboard" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("paying");
        await new Promise((r) => setTimeout(r, 900));
        setStatus("paid");
      }}
    >
      <div>
        <h1 className="text-[28px] font-bold">Checkout</h1>
        <p className="text-ink-3">Complete your upgrade.</p>
      </div>
      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="font-bold">{plan.name}</p>
          <p className="text-xs text-ink-3">Billed per {plan.per}</p>
        </div>
        <p className="text-xl font-extrabold">{formatPKR(total)}</p>
      </Card>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium">Payment method</legend>
        {paymentMethods.map((m) => (
          <label
            key={m.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border-2 p-3.5",
              method === m.id ? "border-brand-600 bg-brand-50" : "border-line",
            )}
          >
            <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
            <span>
              <span className="block text-sm font-semibold">{m.label}</span>
              <span className="text-xs text-ink-3">{m.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {method === "card" ? (
        <Field label="Card number" name="card" inputMode="numeric" placeholder="4242 4242 4242 4242" required />
      ) : (
        <Field label="Mobile account number" name="mobile" inputMode="tel" placeholder="03XX XXXXXXX" required />
      )}
      <Button type="submit" size="lg" disabled={status === "paying"}>
        {status === "paying" ? "Processing…" : `Pay ${formatPKR(total)}`}
      </Button>
      <Link href="/pricing" className="text-center text-sm text-ink-3 hover:text-ink">
        ← Back to pricing
      </Link>
    </form>
  );
}
