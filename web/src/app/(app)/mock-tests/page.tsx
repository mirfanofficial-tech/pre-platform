import { MockTestList } from "@/components/exam/mock-test-list";

export const metadata = { title: "Mock Tests — PrepMaster" };

export default function MockTestsPage() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold">Mock tests</h1>
        <p className="text-ink-3">Full-length timed papers that mirror the real pattern.</p>
      </div>
      <MockTestList />
    </div>
  );
}
