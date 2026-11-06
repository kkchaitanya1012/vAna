"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="panel max-w-md rounded-panel p-7">
      <h1 className="display text-[28px] leading-tight">This page did not load</h1>
      <p className="mt-2 text-muted">
        Something failed while building the page. Your sessions are safe. Try again, or go back to the list.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn">Try again</button>
        <Link href="/sessions" className="btn btn-quiet">All sessions</Link>
      </div>
    </div>
  );
}
