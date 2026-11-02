import { Faq } from "@/components/marketing/faq";
import { PlanCards } from "@/components/marketing/plan-cards";
import { Section } from "@/components/marketing/section";
import { Card } from "@/components/ui/card";
import { comparison, pricingFaqs } from "@/data/content";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing — PrepMaster" };

const heads = ["Feature", "Free", "Premium Monthly", "Premium Annual"];

export default function PricingPage() {
  return (
    <>
      <Section
        eyebrow="Pricing"
        title="One plan per student. No hidden add-ons."
        lead="Every plan gives you the full question bank experience. Premium removes the monthly limits and unlocks Premium mock tests. Prices shown are suggestions while plans are finalised."
      >
        <PlanCards />
      </Section>

      <Section
        subtle
        eyebrow="Compare"
        title="Compare what you get"
        lead="Limits reset on the first of every month. You can switch or cancel a plan at any time from your subscription settings."
      >
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {heads.map((h, i) => (
                  <th key={h} className={cn("px-5 py-3 font-semibold", i === 2 && "text-brand-700")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row[0]} className="border-t border-line">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={cn("px-5 py-3.5", i === 0 ? "font-medium" : "text-ink-2", i === 2 && "bg-brand-50/50")}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section eyebrow="FAQ" title="Pricing questions">
        <Faq items={pricingFaqs} />
      </Section>
    </>
  );
}
