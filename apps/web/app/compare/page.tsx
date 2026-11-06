import Link from "next/link";
import { Suspense } from "react";
import { CompareView } from "@/components/compare/compare-view";
import { PageSkeleton } from "@/components/skeleton";
import { getCompare } from "@/lib/api";

async function Body({ params }: { params: Promise<{ ids?: string }> }) {
  const ids = ((await params).ids ?? "").split(",").filter(Boolean);
  const back = <Link href="/sessions" className="btn mt-5">Pick sessions</Link>;
  if (ids.length < 2 || ids.length > 4) {
    return (
      <div className="panel max-w-md rounded-panel p-7">
        <p className="text-muted">Pick 2 to 4 sessions on the Sessions page to compare them.</p>
        {back}
      </div>
    );
  }
  let items;
  try {
    items = await getCompare(ids);
  } catch (e) {
    return (
      <div role="alert" className="panel max-w-md rounded-panel border-bad/40 p-6 text-bad">
        {e instanceof Error ? e.message : "Could not load the comparison."}
        {back}
      </div>
    );
  }
  return <CompareView items={items} />;
}

export default function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  return (
    <div className="space-y-6">
      <h1 className="display text-[34px] leading-none sm:text-[40px]">Compare</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Body params={searchParams} />
      </Suspense>
    </div>
  );
}
