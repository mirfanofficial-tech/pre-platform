"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { ME_KEY, useMe, type User } from "@/lib/auth";

type Values = { full_name: string; phone: string; target_exam_date: string; daily_goal: number; leaderboard_opt_in: boolean };

export default function SettingsPage() {
  const { data: user } = useMe();
  const client = useQueryClient();
  const { register, handleSubmit, reset } = useForm<Values>();

  useEffect(() => {
    if (user) {
      reset({
        full_name: user.full_name,
        phone: user.phone ?? "",
        target_exam_date: user.target_exam_date ?? "",
        daily_goal: user.daily_goal,
        leaderboard_opt_in: user.leaderboard_opt_in,
      });
    }
  }, [user, reset]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      api<User>("/api/v1/me", {
        method: "PATCH",
        body: {
          full_name: v.full_name,
          phone: v.phone || null,
          target_exam_date: v.target_exam_date || null,
          daily_goal: Number(v.daily_goal),
          leaderboard_opt_in: v.leaderboard_opt_in,
        },
      }),
    onSuccess: (updated) => client.setQueryData(ME_KEY, updated),
  });

  const problem = save.error instanceof ApiError ? (save.error.problem.errors?.[0]?.message ?? save.error.problem.title) : null;

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Settings</h1>
        <p className="text-ink-3">Your profile and preparation preferences.</p>
      </div>
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
          <Field label="Full name" {...register("full_name")} />
          <Field label="Email" type="email" value={user?.email ?? ""} readOnly hint="Your email address cannot be changed yet." />
          <Field label="Phone number (optional)" type="tel" {...register("phone")} />
          <Field label="Target exam date" type="date" {...register("target_exam_date")} />
          <Field label="Daily goal (questions)" type="number" min={1} max={1000} {...register("daily_goal")} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" {...register("leaderboard_opt_in")} />
            <span>
              <span className="font-medium">Show me on the leaderboard</span>
              <span className="block text-ink-3">
                Others will see only your first name and the initial of your last name, with your score. You can turn
                this off at any time.
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
            {save.isSuccess && (
              <span role="status" className="text-sm text-brand-700">
                Saved
              </span>
            )}
            {problem && (
              <span role="alert" className="text-sm text-danger">
                {problem}
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
