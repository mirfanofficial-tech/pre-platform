"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { ME_KEY, safeNext, type User } from "@/lib/auth";

const email = z.string().email("Enter a valid email address");

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean().optional(),
});

const registerSchema = z
  .object({
    name: z.string().min(2, "Enter your full name"),
    email,
    phone: z.string().optional(),
    exam: z.string().min(1, "Choose your target exam"),
    password: z.string().min(8, "Use at least 8 characters").regex(/\d/, "Include at least one number"),
    confirm: z.string(),
    terms: z.literal(true, { error: "Accept the terms to continue" }),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
    when: () => true,
  });

type Values = {
  name?: string;
  email: string;
  phone?: string;
  exam?: string;
  password: string;
  confirm?: string;
  terms?: boolean;
  remember?: boolean;
};

const exams = [
  { slug: "lat", label: "LAT — Law Admission Test" },
  { slug: "mdcat", label: "MDCAT" },
  { slug: "ecat", label: "ECAT" },
  { slug: "css", label: "CSS / PMS" },
  { slug: "nts", label: "NTS" },
];

const apiFieldToForm: Record<string, keyof Values> = {
  full_name: "name",
  email: "email",
  password: "password",
  phone: "phone",
  target_exam: "exam",
};

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      className="text-ink-3 hover:text-ink"
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const isRegister = mode === "register";
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(isRegister ? registerSchema : loginSchema) as never });

  const onSubmit = async (values: Values) => {
    setFormError("");
    try {
      const user = isRegister
        ? await api<User>("/api/v1/auth/register", {
            method: "POST",
            body: {
              full_name: values.name,
              email: values.email,
              password: values.password,
              phone: values.phone || null,
              target_exam: exams.find((e) => e.label === values.exam)?.slug ?? null,
            },
          })
        : await api<User>("/api/v1/auth/login", {
            method: "POST",
            body: { email: values.email, password: values.password, remember: values.remember ?? true },
          });
      client.setQueryData(ME_KEY, user);
      if (isRegister) {
        setSent(true);
        await new Promise((r) => setTimeout(r, 1200));
      }
      router.push(safeNext(params.get("next")));
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setFormError("Cannot reach the server. Check your connection and try again.");
        return;
      }
      if (e.code === "email_taken") {
        setError("email", { message: "This email is already registered. Try logging in." });
      } else if (e.code === "validation_error" && e.problem.errors?.length) {
        for (const f of e.problem.errors) {
          const key = apiFieldToForm[f.field];
          if (key) setError(key, { message: f.message });
        }
      } else if (e.code === "invalid_credentials") {
        setFormError("Incorrect email or password.");
      } else if (e.code === "account_locked") {
        setFormError(`Too many failed attempts. ${e.problem.detail ?? ""}`.trim());
      } else {
        setFormError(e.problem.detail ?? e.problem.title);
      }
    }
  };

  const toggle = <PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} />;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {isRegister && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" placeholder="Ahmed Raza" error={errors.name?.message} {...register("name")} />
            <Field label="Email address" type="email" placeholder="ahmed.raza@email.com" error={errors.email?.message} {...register("email")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number (optional)" type="tel" placeholder="+92 300 1234567" error={errors.phone?.message} {...register("phone")} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="exam" className="text-[13px] font-medium">
                Target examination
              </label>
              <select
                id="exam"
                className="h-11 rounded-md border border-line-strong bg-white px-3 text-sm"
                defaultValue=""
                {...register("exam")}
              >
                <option value="" disabled>
                  Select an exam
                </option>
                {exams.map((e) => (
                  <option key={e.slug}>{e.label}</option>
                ))}
              </select>
              {errors.exam && (
                <p role="alert" className="text-xs text-danger">
                  {errors.exam.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Password"
              type={show ? "text" : "password"}
              placeholder="At least 8 characters"
              hint="At least 8 characters with one number."
              trailing={toggle}
              error={errors.password?.message}
              {...register("password")}
            />
            <Field
              label="Confirm password"
              type={show ? "text" : "password"}
              placeholder="Repeat password"
              error={errors.confirm?.message}
              {...register("confirm")}
            />
          </div>
          <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" {...register("terms")} />
            <span>
              I agree to the PrepMaster{" "}
              <Link href="#" className="font-semibold text-brand-700">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="#" className="font-semibold text-brand-700">
                Privacy Policy
              </Link>
              , and I confirm the information above is my own.
            </span>
          </label>
          {errors.terms && (
            <p role="alert" className="-mt-2 text-xs text-danger">
              {errors.terms.message}
            </p>
          )}
        </>
      )}

      {!isRegister && (
        <>
          <Field label="Email address" type="email" placeholder="ahmed.raza@email.com" error={errors.email?.message} {...register("email")} />
          <Field
            label="Password"
            type={show ? "text" : "password"}
            placeholder="Your password"
            trailing={toggle}
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="flex items-center justify-between text-[13px]">
            <label className="flex items-center gap-2 text-ink-2">
              <input type="checkbox" defaultChecked className="size-4 accent-brand-600" {...register("remember")} />
              Keep me signed in
            </label>
            <Link href="/forgot-password" className="font-semibold text-brand-700">
              Forgot password?
            </Link>
          </div>
        </>
      )}

      {formError && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-bg px-3.5 py-3 text-[13px] text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Please wait…" : isRegister ? "Create free account" : "Log in"}
        {!isSubmitting && (isRegister ? <Plus size={18} /> : <ArrowRight size={18} />)}
      </Button>

      {sent && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-brand-50 px-3.5 py-3 text-[13px] text-brand-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Verification email sent. Confirm your address to unlock mock tests.
        </p>
      )}

      {!isRegister && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["Continue with Google", "Continue with phone"].map((l) => (
              <Button key={l} type="button" variant="secondary" size="sm" onClick={() => setNotice(`${l} is not available yet.`)}>
                {l}
              </Button>
            ))}
          </div>
          {notice && (
            <p role="status" className="text-center text-xs text-ink-3">
              {notice}
            </p>
          )}
        </>
      )}

      <p className="text-center text-sm text-ink-3">
        {isRegister ? "Already have an account?" : "New to PrepMaster?"}{" "}
        <Link href={isRegister ? "/login" : "/register"} className="font-semibold text-brand-700">
          {isRegister ? "Log in" : "Create a free account"}
        </Link>
      </p>
    </form>
  );
}
