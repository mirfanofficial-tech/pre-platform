import { ForgotPasswordForm } from "@/components/auth/account-flows";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Forgot password — PrepMaster" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      headline="Locked out? It happens."
      lead="Enter your email and we will send you a link to choose a new password."
    >
      <h1 className="text-[28px] font-bold">Reset your password</h1>
      <p className="mb-8 mt-1 text-ink-3">We will email you a reset link.</p>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
