import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/account-flows";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Choose a new password — PrepMaster" };

export default function ResetPasswordPage() {
  return (
    <AuthShell headline="Choose a new password." lead="Pick something you have not used on other sites.">
      <h1 className="text-[28px] font-bold">New password</h1>
      <p className="mb-8 mt-1 text-ink-3">Changing it signs you out everywhere else.</p>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
