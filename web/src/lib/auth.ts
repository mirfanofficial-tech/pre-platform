"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import type { components } from "./api-types";

export type User = components["schemas"]["UserOut"];

export const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<User>("/api/v1/me"),
    retry: (count, error) => !(error instanceof ApiError) && count < 2,
    staleTime: 60_000,
  });
}

export function useLogout() {
  const router = useRouter();
  const client = useQueryClient();
  return async () => {
    await api("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    client.clear();
    router.push("/login");
  };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
