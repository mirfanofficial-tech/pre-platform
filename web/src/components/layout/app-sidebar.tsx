"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  BookOpen,
  ClipboardCheck,
  Compass,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Settings,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import { initials, useLogout, useMe } from "@/lib/auth";
import { Logo } from "./site-header";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

const nav: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/exams", label: "My Exams", icon: Compass },
  { href: "/practice", label: "Practice MCQs", icon: ClipboardCheck },
  { href: "/mock-tests", label: "Mock Tests", icon: FileText },
  { href: "/materials", label: "Study Materials", icon: BookOpen },
  { href: "/saved", label: "Saved Questions", icon: Bookmark },
  { href: "/analytics", label: "Performance Analytics", icon: BarChart3 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

const tabs: Item[] = [
  { ...nav[0], label: "Home" },
  { ...nav[1], label: "Exams" },
  { ...nav[2], label: "Practice" },
  { ...nav[6], label: "Analytics" },
  { href: "/settings", label: "Profile", icon: User },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function AppSidebar() {
  const pathname = usePathname();
  const { data: user } = useMe();
  const logout = useLogout();
  const badge = user ? initials(user.full_name) : "";
  return (
    <>
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-r border-line bg-white p-3 md:flex md:w-[76px] lg:w-[248px] lg:p-5">
        <div className="flex flex-col gap-8">
          <div className="flex justify-center lg:justify-start">
            <Logo compact />
          </div>
          <nav className="flex flex-col gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={label}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium lg:justify-start",
                  isActive(pathname, href) ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-surface-neutral",
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-4">
          <div className="hidden rounded-md bg-brand-50 p-4 lg:block">
            <p className="text-sm font-semibold text-brand-900">Unlock unlimited mocks</p>
            <p className="mt-1 text-xs text-ink-2">You have 1 free mock test left this month.</p>
            <Link href="/pricing" className="mt-2 inline-block text-xs font-semibold text-brand-700">
              Go Premium →
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-800">
              {badge}
            </span>
            <div className="hidden flex-1 lg:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs text-ink-3">Free plan</p>
            </div>
            <button onClick={logout} aria-label="Log out" className="hidden text-ink-3 hover:text-ink lg:block">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-line bg-white px-4 md:hidden">
        <Logo />
        <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-800">
          {badge}
        </span>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              isActive(pathname, href) ? "text-brand-700" : "text-ink-3",
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
