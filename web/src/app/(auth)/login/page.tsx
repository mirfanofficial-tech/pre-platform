import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Log in — PrepMaster" };

export default function LoginPage() {
  return (
    <AuthShell
      headline="Welcome back. Your streak is waiting."
      lead="Log in to pick up your LAT practice exactly where you left off."
      bullets={["12 day study streak in progress", "1 free mock test left this month", "Saved questions synced across devices"]}
    >
      <h1 className="text-[28px] font-bold">Log in to PrepMaster</h1>
      <p className="mb-8 mt-1 text-ink-3">Enter your details to continue your preparation.</p>
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
