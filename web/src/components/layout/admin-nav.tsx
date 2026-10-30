"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Logo } from "./site-header";
import { ButtonLink } from "@/components/ui/button";
import { adminNav } from "@/data/extra";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col justify-between border-r border-line bg-white p-5 lg:flex">
        <div className="flex flex-col gap-6">
          <div>
            <Logo />
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Admin console</p>
          </div>
          <nav className="flex flex-col gap-1">
            {adminNav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm font-medium",
                  active(n.href) ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-surface-neutral",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <ButtonLink href="/admin/questions/new" size="sm">
            <Plus size={16} /> New question
          </ButtonLink>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-800">
            SK
          </span>
          <div>
            <p className="text-sm font-semibold">Sadia Khan</p>
            <p className="text-xs text-ink-3">Content administrator</p>
          </div>
        </div>
      </aside>
      <div className="border-b border-line bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Admin</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {adminNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium",
                active(n.href) ? "bg-brand-600 text-white" : "bg-surface-neutral text-ink-2",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
