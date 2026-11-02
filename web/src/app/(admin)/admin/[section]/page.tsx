import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { adminNav } from "@/data/extra";

const skipped = ["students", "questions", "subscriptions", "reports", "audit", "exams", "mock-tests"];
const sections = adminNav.map((n) => n.href.split("/")[2]).filter((s) => s && !skipped.includes(s));

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

async function SectionContent({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = adminNav.find((n) => n.href === `/admin/${section}`);
  if (!item || !sections.includes(section)) notFound();
  return (
    <>
      <h1 className="text-[28px] font-bold">{item.label}</h1>
      <Card className="text-center text-ink-3">This section is not part of the first release of the admin console.</Card>
    </>
  );
}

export default function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <Suspense fallback={<div className="h-10 w-48 animate-pulse rounded-md bg-surface-neutral" />}>
        <SectionContent params={params} />
      </Suspense>
    </div>
  );
}
