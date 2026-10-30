import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/card";

export const metadata = { title: "Subscription — PrepMaster" };

export default function SubscriptionPage() {
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Subscription</h1>
        <p className="text-ink-3">Manage your plan and billing.</p>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Free plan</h2>
            <Badge tone="neutral">Current</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-3">300 practice MCQs and 2 mock tests every month.</p>
        </div>
        <ButtonLink href="/pricing">Upgrade to Premium</ButtonLink>
      </Card>
      <Card>
        <h2 className="font-bold">This month’s usage</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {[
            ["Practice MCQs", "86 / 300", 29],
            ["Mock tests", "1 / 2", 50],
          ].map(([l, v, p]) => (
            <div key={l as string}>
              <div className="mb-1.5 flex justify-between text-[13px]">
                <span className="font-medium">{l}</span>
                <span className="text-ink-3">{v}</span>
              </div>
              <ProgressBar value={p as number} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">Billing history</h2>
        <p className="mt-2 text-sm text-ink-3">No payments yet. Invoices will appear here after your first purchase.</p>
      </Card>
    </div>
  );
}
