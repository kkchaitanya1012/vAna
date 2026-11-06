"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SpectrumBar, stageParts } from "@/components/spectrum-bar";
import { StatusBadge } from "@/components/status-badge";
import { ToneGlyph } from "@/components/tone-glyph";
import type { SessionOut } from "@/lib/api";
import { fmtMs, fmtUsd, latencyTone } from "@/lib/format";

const MAX = 4;

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function Response({ s, max }: { s: SessionOut; max: number }) {
  const p50 = s.summary?.v2v_p50;
  if (p50 == null) return <span className="text-muted">No answer measured</span>;
  const parts = stageParts(s.summary?.stage_avg);
  const total = parts.reduce((a, b) => a + b.ms, 0);
  return (
    <div className="w-full min-w-[9rem]">
      <p className="flex items-center gap-2">
        <span className="display text-[22px] leading-6">{fmtMs(p50)}</span>
        <ToneGlyph tone={latencyTone(p50)} size={10} />
      </p>
      <div className="mt-2"><SpectrumBar parts={parts} height={5} scale={max ? total / max : 1} flat /></div>
    </div>
  );
}

export function SessionTable({ rows }: { rows: SessionOut[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX ? [...p, id] : p));
  const max = Math.max(
    ...rows.map((r) => stageParts(r.summary?.stage_avg).reduce((a, b) => a + b.ms, 0)),
    1,
  );
  const box = (s: SessionOut) => {
    const on = picked.includes(s.id);
    return (
      <input type="checkbox" checked={on} disabled={!on && picked.length >= MAX} onChange={() => toggle(s.id)}
             aria-label={`Select ${s.persona_name} session ${s.id.slice(0, 8)} for comparison`}
             className="size-[18px] accent-[var(--text)]" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-30 -mx-4 flex items-center justify-between gap-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <p className="text-[13px] text-muted" aria-live="polite">
          {picked.length < 2 ? `Tick 2 to ${MAX} sessions to compare them.` : `${picked.length} selected.`}
        </p>
        <button type="button" className="btn !h-10" disabled={picked.length < 2}
                onClick={() => router.push(`/compare?ids=${picked.join(",")}`)}>
          Compare
        </button>
      </div>

      {/* Phone: one card per session */}
      <ul className="space-y-3 sm:hidden">
        {rows.map((s) => (
          <li key={s.id} className={`panel rounded-panel p-4 ${picked.includes(s.id) ? "!border-line-strong bg-raised" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="pt-0.5">{box(s)}</div>
              <div className="min-w-0 flex-1">
                <Link href={`/sessions/${s.id}`} className="flex items-baseline justify-between gap-3">
                  <span suppressHydrationWarning className="num text-[13px] font-medium">{when(s.created_at)}</span>
                  <StatusBadge status={s.status} />
                </Link>
                <p className="mono mt-1 truncate text-xs text-muted">{s.llm_model ?? s.llm_provider} · {s.tts_provider}</p>
                <div className="mt-3"><Response s={s} max={max} /></div>
                <p className="num mt-3 text-xs text-muted">
                  {s.persona_name} · {s.summary?.responded_turns ?? 0} turns · {fmtUsd(s.summary?.cost_usd?.total)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet and up: one row per session */}
      <div className="panel hidden overflow-x-auto rounded-panel sm:block">
        <table className="w-full text-left">
          <thead className="label">
            <tr className="border-b border-line">
              <th className="w-12 py-3.5 pl-5"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3.5 font-medium">Call</th>
              <th className="px-4 py-3.5 font-medium">Stack</th>
              <th className="px-4 py-3.5 font-medium">Typical response</th>
              <th className="px-4 py-3.5 font-medium">Turns</th>
              <th className="px-4 py-3.5 font-medium">Cost</th>
              <th className="px-4 py-3.5 pr-5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={`border-t border-line transition-colors hover:bg-surface-2 ${picked.includes(s.id) ? "bg-raised" : ""}`}>
                <td className="py-4 pl-5">{box(s)}</td>
                <td className="px-4 py-4">
                  <Link href={`/sessions/${s.id}`} suppressHydrationWarning className="num font-medium underline-offset-4 hover:underline">
                    {when(s.created_at)}
                  </Link>
                  <p className="text-xs text-muted">{s.persona_name}</p>
                </td>
                <td className="px-4 py-4">
                  <p className="mono max-w-[16rem] truncate text-[13px]">{s.llm_model ?? s.llm_provider}</p>
                  <p className="text-xs text-muted">{s.stt_provider} to {s.tts_provider}</p>
                </td>
                <td className="px-4 py-4"><Response s={s} max={max} /></td>
                <td className="num px-4 py-4">{s.summary?.responded_turns ?? <span className="text-muted">n/a</span>}</td>
                <td className="num px-4 py-4">{fmtUsd(s.summary?.cost_usd?.total)}</td>
                <td className="px-4 py-4 pr-5"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
