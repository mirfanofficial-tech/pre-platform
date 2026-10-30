"use client";

import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";

function VerifyBanner() {
  const resend = useMutation({ mutationFn: () => api("/api/v1/auth/resend-verification", { method: "POST" }) });
  const tooSoon = resend.error instanceof ApiError && resend.error.code === "too_soon";
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 bg-warning-bg px-4 py-2.5 text-[13px] text-amber-900">
      <MailWarning size={16} className="shrink-0" />
      <span className="flex-1">Confirm your email address to unlock mock tests. We sent you a link when you registered.</span>
      {resend.isSuccess ? (
        <span className="font-semibold">Email sent</span>
      ) : (
        <Button variant="secondary" size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>
          {tooSoon ? "Wait a minute…" : "Resend email"}
        </Button>
      )}
    </div>
  );
}

export function AuthGuard({
  children,
  roles,
  banner = false,
}: {
  children: React.ReactNode;
  roles?: string[];
  banner?: boolean;
}) {
  const { data: user, error, isPending, refetch } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const unauthenticated = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  if (isPending || unauthenticated) {
    return <div className="grid min-h-screen place-items-center text-ink-3">Loading…</div>;
  }
  if (error || !user) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-[420px] text-center">
          <h1 className="text-lg font-bold">Cannot reach the server</h1>
          <p className="mt-1 text-sm text-ink-3">Check your connection and try again.</p>
          <Button className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-[420px] text-center">
          <h1 className="text-lg font-bold">You do not have access</h1>
          <p className="mt-1 text-sm text-ink-3">This area is for staff accounts.</p>
        </Card>
      </div>
    );
  }
  return (
    <>
      {banner && !user.email_verified && <VerifyBanner />}
      {children}
    </>
  );
}
