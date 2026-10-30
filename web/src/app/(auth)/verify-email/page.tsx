import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/account-flows";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Confirm your email — PrepMaster" };

export default function VerifyEmailPage() {
  return (
    <AuthShell headline="One quick step." lead="Confirming your email unlocks full-length mock tests.">
      <h1 className="mb-6 text-[28px] font-bold">Confirm your email</h1>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  );
}
