import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";

export function Logo({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="PrepMaster home">
      <span className="grid size-9 place-items-center rounded-md bg-brand-600 text-white">
        <GraduationCap size={20} />
      </span>
      <span
        className={`text-lg font-bold ${inverse ? "text-white" : "text-brand-900"} ${compact ? "md:hidden lg:inline" : ""}`}
      >
        PrepMaster
      </span>
    </Link>
  );
}

export const publicLinks = [
  { href: "/#exams", label: "Exams" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-[1200px] items-center justify-between px-5 md:h-[77px]">
        <Logo />
        <nav className="hidden gap-8 md:flex">
          {publicLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-ink-2 hover:text-brand-700">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" size="sm">
            Start free
          </ButtonLink>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
