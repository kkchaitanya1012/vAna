"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SessionFilters({ personas, providers }: { personas: string[]; providers: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: "persona" | "provider", value: string) {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`/sessions${q.size ? `?${q}` : ""}`);
  }

  const sel = "field !w-auto min-w-40 text-[13px]";
  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-xs font-medium text-muted">
        <span className="mb-1.5 block">Persona</span>
        <select className={sel} value={params.get("persona") ?? ""} onChange={(e) => set("persona", e.target.value)}>
          <option value="">All personas</option>
          {personas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-muted">
        <span className="mb-1.5 block">Provider</span>
        <select className={sel} value={params.get("provider") ?? ""} onChange={(e) => set("provider", e.target.value)}>
          <option value="">All providers</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
    </div>
  );
}
