"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

function Alert({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={tone === "ok" ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-md px-3.5 py-3 text-[13px] ${
        tone === "ok" ? "bg-brand-50 text-brand-800" : "bg-danger-bg text-danger"
      }`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().email("Enter a valid email address") })),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(async ({ email }) => {
        setError("");
        try {
          await api("/api/v1/auth/forgot-password", { method: "POST", body: { email } });
          setSent(true);
        } catch {
          setError("Something went wrong. Please try again.");
        }
      })}
    >
      <Field label="Email address" type="email" placeholder="you@example.com" error={errors.email?.message} {...register("email")} />
      {error && <Alert tone="error">{error}</Alert>}
      {sent && (
        <Alert tone="ok">If an account exists for that address, we have sent a link to reset your password.</Alert>
      )}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-center text-sm font-semibold text-brand-700">
        Back to log in
      </Link>
    </form>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").regex(/\d/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match.", when: () => true });

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetSchema) });

  if (!token) return <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>;
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="ok">Your password has been changed. Log in with your new password.</Alert>
        <ButtonLink href="/login" size="lg">
          Log in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(async ({ password }) => {
        setError("");
        try {
          await api("/api/v1/auth/reset-password", { method: "POST", body: { token, password } });
          setDone(true);
        } catch (e) {
          setError(
            e instanceof ApiError && e.code === "invalid_token"
              ? "This link is invalid or has expired. Request a new one."
              : e instanceof ApiError
                ? (e.problem.errors?.[0]?.message ?? e.problem.title)
                : "Cannot reach the server. Try again.",
          );
        }
      })}
    >
      <Field label="New password" type="password" hint="At least 8 characters with one number." error={errors.password?.message} {...register("password")} />
      <Field label="Confirm new password" type="password" error={errors.confirm?.message} {...register("confirm")} />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Change password"}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm font-semibold text-brand-700">
        Request a new link
      </Link>
    </form>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">(token ? "working" : "error");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api("/api/v1/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  if (state === "working") {
    return (
      <p className="flex items-center gap-2 text-ink-2">
        <Loader2 size={18} className="animate-spin" /> Confirming your email…
      </p>
    );
  }
  if (state === "ok") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="ok">Your email address is confirmed. Mock tests are unlocked.</Alert>
        <ButtonLink href="/dashboard" size="lg">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="error">This link is invalid or has expired. Log in and choose “Resend email” to get a new one.</Alert>
      <ButtonLink href="/login" variant="secondary" size="lg">
        Log in
      </ButtonLink>
    </div>
  );
}
