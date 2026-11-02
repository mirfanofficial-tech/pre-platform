"use client";

import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadProblem, Pager, problemText, shortDate } from "@/components/admin/common";
import { grantPremium, listStudents, patchStudent, revokePremium, type StudentRow } from "@/lib/admin";
import { useMe } from "@/lib/auth";

const PAGE_SIZE = 20;
const selectClass = "h-9 rounded-md border border-line-strong bg-white px-2 text-sm";
const roles = ["student", "editor", "reviewer", "admin"];

export function StudentsView() {
  const client = useQueryClient();
  const me = useMe().data;
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());

  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["admin", "students", { q, role, page }],
    queryFn: () => listStudents({ q, role, page }),
    placeholderData: (previous) => previous,
  });

  const act = useMutation({
    mutationFn: (job: () => Promise<void>) => job(),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });

  const confirmThen = (message: string, job: () => Promise<void>) => {
    if (window.confirm(message)) act.mutate(job);
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <h1 className="text-[28px] font-bold">Students</h1>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search students"
            placeholder="Search by name or email"
            className="h-11 w-full rounded-md border border-line-strong bg-white pl-10 pr-4 text-sm"
          />
        </div>
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-md border border-line-strong bg-white px-3 text-sm"
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r[0].toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {act.isError && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-danger">
          {problemText(act.error)}
        </p>
      )}

      {error && !data ? (
        <LoadProblem error={error} retry={refetch} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-subtle text-left text-xs text-ink-3">
              <tr>
                {["Student", "Role", "Plan", "Joined", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isPending && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-ink-3">
                    Loading…
                  </td>
                </tr>
              )}
              {data?.items.map((s: StudentRow) => {
                const self = s.id === me?.id;
                return (
                  <tr key={s.id} className="border-t border-line align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-medium">
                        {s.full_name} {s.status === "suspended" && <Badge tone="danger">Suspended</Badge>}
                      </p>
                      <p className="text-xs text-ink-3">
                        {s.email}
                        {!s.email_verified && " · email not confirmed"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <select
                        aria-label={`Role for ${s.full_name}`}
                        className={selectClass}
                        value={s.role}
                        disabled={self || act.isPending}
                        onChange={(e) => act.mutate(() => patchStudent(s.id, { role: e.target.value }))}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={s.plan === "Free" ? "neutral" : "brand"}>{s.plan}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-ink-2">{shortDate(s.joined)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        {s.plan === "Free" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() =>
                              confirmThen(`Give ${s.full_name} 30 days of Premium?`, () =>
                                grantPremium(s.id, "premium_monthly", 30),
                              )
                            }
                          >
                            Grant 30 days
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() => confirmThen(`End ${s.full_name}'s Premium now?`, () => revokePremium(s.id))}
                          >
                            Revoke Premium
                          </Button>
                        )}
                        {!self && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={act.isPending}
                            onClick={() =>
                              confirmThen(
                                s.status === "active"
                                  ? `Suspend ${s.full_name}? They will be logged out straight away.`
                                  : `Reactivate ${s.full_name}?`,
                                () => patchStudent(s.id, { status: s.status === "active" ? "suspended" : "active" }),
                              )
                            }
                          >
                            {s.status === "active" ? "Suspend" : "Reactivate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-ink-3">
                    No one matches that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />}
        </Card>
      )}
    </div>
  );
}
