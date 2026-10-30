import { ChevronDown } from "lucide-react";
import { faqs } from "@/data/content";

export function Faq({ items = faqs }: { items?: { q: string; a: string }[] }) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3">
      {items.map((f, i) => (
        <details key={f.q} open={i === 0} className="group rounded-md border border-line bg-white px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {f.q}
            <ChevronDown size={18} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
