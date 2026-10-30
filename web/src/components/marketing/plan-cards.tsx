import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPKR, plans } from "@/data/content";

export function PlanCards() {
  return (
    <div className="grid items-start gap-6 md:grid-cols-3">
      {plans.map((p) => (
        <div
          key={p.id}
          className={cn(
            "flex flex-col rounded-lg border bg-white p-7",
            p.highlight ? "border-brand-600 shadow-[0_8px_30px_rgba(5,150,105,0.15)]" : "border-line",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold">{p.name}</h3>
            {p.badge && <Badge tone={p.highlight ? "brand" : "neutral"}>{p.badge}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-3">{p.blurb}</p>
          <p className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight">{formatPKR(p.price)}</span>
            <span className="text-sm text-ink-3">/ {p.per}</span>
          </p>
          <ButtonLink
            href={p.id === "free" ? "/register" : `/checkout?plan=${p.id}`}
            variant={p.highlight ? "primary" : "secondary"}
            className="mt-6"
          >
            {p.cta}
          </ButtonLink>
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
      ))}
    </div>
  );
}
