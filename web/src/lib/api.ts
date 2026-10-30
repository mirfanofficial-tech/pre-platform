import type { paths } from "./api-types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; message: string }[];
};

export class ApiError extends Error {
  constructor(public problem: Problem) {
    super(problem.title);
  }

  get status() {
    return this.problem.status;
  }

  get code() {
    return this.problem.code;
  }
}

type Json = Record<string, unknown> | unknown[];

export async function api<T>(
  path: string,
  init: { method?: string; body?: Json; headers?: Record<string, string> } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF": "1" } : {}),
      ...init.headers,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      problem ?? { type: "about:blank", title: res.statusText, status: res.status, code: "error" },
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export type Health = paths["/healthz"]["get"]["responses"]["200"]["content"]["application/json"];

export const getHealth = () => api<Health>("/healthz");
