"use client";

import { useMe } from "@/lib/auth";

export function FirstName({ fallback = "there" }: { fallback?: string }) {
  const { data } = useMe();
  return <>{data?.full_name.split(" ")[0] ?? fallback}</>;
}
