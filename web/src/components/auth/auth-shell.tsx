import { Check } from "lucide-react";
import { Logo } from "@/components/layout/site-header";

export function AuthShell({
  headline,
  lead,
  bullets = [],
  wide = false,
  children,
}: {
  headline: string;
  lead: string;
  bullets?: string[];
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[560px_1fr]">
      <aside className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <Logo inverse />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">{headline}</h2>
          <p className="mt-4 text-brand-100/80">{lead}</p>
          {bullets.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3 text-sm">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center rounded-full bg-brand-500/30 text-brand-100">
                    <Check size={12} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
        <figure className="rounded-lg bg-white/10 p-5">
          <blockquote className="text-sm leading-relaxed">
            “I went from 52 to 78 on my mock tests in nine weeks of daily practice.”
          </blockquote>
          <figcaption className="mt-2 text-xs text-brand-100/70">Ayesha Hameed · LAT aspirant, Lahore</figcaption>
        </figure>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className={wide ? "w-full max-w-[640px]" : "w-full max-w-[440px]"}>{children}</div>
      </main>
    </div>
  );
}
