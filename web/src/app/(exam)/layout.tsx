import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-3">Loading…</div>}>
      <AuthGuard>{children}</AuthGuard>
    </Suspense>
  );
}
