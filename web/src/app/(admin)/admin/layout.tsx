import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AdminNav } from "@/components/layout/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-3">Loading…</div>}>
      <AuthGuard roles={["admin", "editor", "reviewer"]}>
        <div className="min-h-screen bg-surface-subtle lg:flex">
          <AdminNav />
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </AuthGuard>
    </Suspense>
  );
}
