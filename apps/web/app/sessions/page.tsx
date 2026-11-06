import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { SessionTable } from "@/components/session-table";
import { SessionFilters } from "@/components/session-filters";
import { getPersonas, getProviders, listSessions, type Persona, type Providers } from "@/lib/api";

async function Filters() {
  let personas: Persona[] = [];
  let providers: Providers | null = null;
  try {
    [personas, providers] = await Promise.all([getPersonas(), getProviders()]);
  } catch {
    return null; // filters are optional; the list still works
  }
  const names = [...new Set([...providers.stt, ...providers.llm, ...providers.tts].map((p) => p.id))].sort();
  return <SessionFilters personas={personas.map((p) => p.name)} providers={names} />;
}

async function SessionList({ filters }: { filters: Promise<{ persona?: string; provider?: string }> }) {
  let rows;
  try {
    rows = await listSessions(await filters);
  } catch (e) {
    return (
      <div role="alert" className="panel max-w-md rounded-panel border-bad/40 p-6 text-bad">
        {e instanceof Error ? e.message : "Could not reach the API."} Is it running on port 8000?
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="panel max-w-md rounded-panel p-7">
        <p className="text-muted">No sessions yet. Start one to see it here.</p>
        <Link href="/" className="btn mt-5">New session</Link>
      </div>
    );
  }
  return <SessionTable rows={rows} />;
}

export default function SessionsPage({ searchParams }: { searchParams: Promise<{ persona?: string; provider?: string }> }) {
  return (
    <div className="space-y-6">
      <h1 className="display text-[34px] leading-none sm:text-[40px]">Sessions</h1>
      <Suspense fallback={null}>
        <Filters />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <SessionList filters={searchParams} />
      </Suspense>
    </div>
  );
}
