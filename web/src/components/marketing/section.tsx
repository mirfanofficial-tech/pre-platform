import { Eyebrow } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Section({
  id,
  eyebrow,
  title,
  lead,
  subtle,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("py-20", subtle && "bg-surface-subtle")}>
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="mx-auto mb-12 max-w-[680px] text-center">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[36px]">{title}</h2>
          {lead && <p className="mt-3 text-[17px] text-ink-2">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
