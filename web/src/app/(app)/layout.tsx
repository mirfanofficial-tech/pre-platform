import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-3">Loading…</div>}>
      <AuthGuard banner>
        <div className="min-h-screen bg-surface-subtle md:flex">
          <AppSidebar />
          <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 lg:p-10">{children}</main>
        </div>
      </AuthGuard>
    </Suspense>
  );
}
