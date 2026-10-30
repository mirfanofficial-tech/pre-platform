import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { students } from "@/data/extra";

export const metadata = { title: "Students — PrepMaster Admin" };

export default function StudentsPage() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <h1 className="text-[28px] font-bold">Students</h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-subtle text-left text-xs text-ink-3">
            <tr>
              {["Student", "Target exam", "Plan", "Joined"].map((h) => (
                <th key={h} className="px-5 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.email} className="border-t border-line">
                <td className="px-5 py-3.5">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-ink-3">{s.email}</p>
                </td>
                <td className="px-5 py-3.5">{s.exam}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={s.plan === "Free" ? "neutral" : "brand"}>{s.plan}</Badge>
                </td>
                <td className="px-5 py-3.5 text-ink-2">{s.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
