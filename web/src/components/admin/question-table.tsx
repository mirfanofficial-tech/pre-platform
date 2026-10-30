import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { recentQuestions } from "@/data/extra";

const statusTone = { Published: "brand", Draft: "neutral", "In review": "warning" } as const;
const diffTone = { Easy: "brand", Medium: "warning", Hard: "danger" } as const;

export function QuestionTable() {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-subtle text-left text-xs text-ink-3">
          <tr>
            {["Question", "Subject", "Difficulty", "Status"].map((h) => (
              <th key={h} className="px-5 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recentQuestions.map((q) => (
            <tr key={q.text} className="border-t border-line">
              <td className="px-5 py-3.5 font-medium">{q.text}</td>
              <td className="px-5 py-3.5 text-ink-2">{q.subject}</td>
              <td className="px-5 py-3.5">
                <Badge tone={diffTone[q.difficulty as keyof typeof diffTone]}>{q.difficulty}</Badge>
              </td>
              <td className="px-5 py-3.5">
                <Badge tone={statusTone[q.status as keyof typeof statusTone]}>{q.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Showing 1–5 of 24,160 questions</p>
    </Card>
  );
}
