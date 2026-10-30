import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create account — PrepMaster" };

export default function RegisterPage() {
  return (
    <AuthShell
      wide
      headline="Start preparing in under two minutes."
      lead="Create a free account, choose your exam and attempt your first practice set today."
      bullets={["300 free practice MCQs every month", "2 free full-length mock tests", "No card required to start"]}
    >
      <h1 className="text-[28px] font-bold">Create your account</h1>
      <p className="mb-8 mt-1 text-ink-3">Free forever plan. Upgrade only when you need unlimited mocks.</p>
      <Suspense fallback={null}>
        <AuthForm mode="register" />
      </Suspense>
    </AuthShell>
  );
}
