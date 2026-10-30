import { QuestionTable } from "@/components/admin/question-table";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Question Bank — PrepMaster Admin" };

export default function QuestionBankPage() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold">Question Bank</h1>
        <ButtonLink href="/admin/questions/new">Create MCQ</ButtonLink>
      </div>
      <QuestionTable />
    </div>
  );
}
