import { fmtMs, fmtUsd } from "@/lib/format";
import { STAGES, stageValues } from "@/lib/stages";
import type { CompareItem } from "@/lib/api";

const LETTERS = ["A", "B", "C", "D"];

type Row = { label: string; hint: string; get: (i: CompareItem) => number | null; fmt: (v: number) => string; best: boolean };

const num = (v: number) => v.toLocaleString();
const ROWS: Row[] = [
  { label: "Typical response", hint: "Median voice-to-voice time", get: (i) => i.session.summary?.v2v_p50 ?? null, fmt: fmtMs, best: true },
  { label: "Slow responses", hint: "95th percentile voice-to-voice time", get: (i) => i.session.summary?.v2v_p95 ?? null, fmt: fmtMs, best: true },
  { label: "Slowest response", hint: "Worst single turn", get: (i) => i.session.summary?.v2v_max ?? null, fmt: fmtMs, best: true },
  { label: "Estimated cost", hint: "Whole session, from catalog prices", get: (i) => i.session.summary?.cost_usd?.total ?? null, fmt: fmtUsd, best: true },
  { label: "Cut-offs", hint: "Times you interrupted the agent", get: (i) => i.session.summary?.interruptions ?? null, fmt: num, best: true },
  { label: "Turns answered", hint: "Turns with a measured response", get: (i) => i.session.summary?.responded_turns ?? null, fmt: num, best: false },
  { label: "Tokens out", hint: "Language model output", get: (i) => i.session.summary?.tokens_out ?? null, fmt: num, best: false },
];

export function stackName(s: CompareItem["session"]) {
  return `${s.llm_model ?? s.llm_provider} · ${s.tts_provider}${s.tts_voice ? ` ${s.tts_voice}` : ""}`;
}

function Tag({ i }: { i: number }) {
  return (
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg">
      {LETTERS[i]}
    </span>
  );
}

/** The lowest value, or null when fewer than 2 sessions have a value or all are equal. Ties all win. */
function bestValue(vals: (number | null)[]): number | null {
  const present = vals.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const min = Math.min(...present);
  return present.every((v) => v === min) ? null : min;
}

/** Index of the first lowest value, or -1. */
function bestIndex(vals: (number | null)[]): number {
  const m = bestValue(vals);
  return m == null ? -1 : vals.indexOf(m);
}

function Verdict({ items }: { items: CompareItem[] }) {
  const p50 = items.map((i) => i.session.summary?.v2v_p50 ?? null);
  const w = bestIndex(p50);
  if (w < 0) return <p className="text-muted">Not enough measured turns to pick a winner yet.</p>;
  const others = p50.filter((_, k) => k !== w && p50[k] != null) as number[];
  const next = Math.min(...others);
  const gap = next - (p50[w] as number);
  const cost = items.map((i) => i.session.summary?.cost_usd?.total ?? null);
  const cw = bestIndex(cost);
  return (
    <div>
      <p className="display max-w-4xl text-balance text-[28px] leading-[1.12] sm:text-[44px]">
        Session {LETTERS[w]} answers fastest, <span className="whitespace-nowrap">{fmtMs(gap)}</span> quicker than the next.{" "}
        <span className="text-muted">
          {cw >= 0 && (cw === w ? "It is also the cheapest." : `Session ${LETTERS[cw]} is the cheapest at ${fmtUsd(cost[cw])}.`)}
        </span>
      </p>
      <p className="mt-4 text-[13px] text-muted">
        Typical response {fmtMs(p50[w])}.
        {items.some((i) => (i.session.summary?.responded_turns ?? 0) < 5) && " Fewer than 5 turns in at least one session, so treat this as a hint."}
      </p>
    </div>
  );
}

function StageBars({ items }: { items: CompareItem[] }) {
  const rows = items.map((it) => {
    const sv = stageValues(it.session.summary?.stage_avg ?? {});
    const parts = STAGES.map((s) => ({ ...s, ms: sv[s.key] ?? 0 }));
    return { it, parts, total: parts.reduce((a, b) => a + b.ms, 0) };
  });
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div>
      <ul className="space-y-4">
        {rows.map((r, k) => (
          <li key={r.it.session.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <Tag i={k} />
            <div className="flex h-7 items-center gap-[2px]" style={{ width: `${(r.total / max) * 100}%`, minWidth: r.total ? 24 : 0 }}
                 role="img" aria-label={`Session ${LETTERS[k]}: ${r.parts.map((p) => `${p.label} ${fmtMs(p.ms)}`).join(", ")}`}>
              {r.parts.map((p, i) => p.ms > 0 && (
                <span key={p.key} className={`h-full rounded-[4px] ${r.parts.slice(i + 1).every((n) => n.ms <= 0) ? "rounded-r-[8px]" : ""}`}
                      style={{ width: `${(p.ms / r.total) * 100}%`, minWidth: 2, background: p.color }} />
              ))}
            </div>
            <span className="num text-[13px] font-semibold">{r.total ? fmtMs(r.total) : "n/a"}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {STAGES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function pct(sorted: number[], p: number) {
  const k = (sorted.length - 1) * (p / 100), lo = Math.floor(k), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

function Strip({ items }: { items: CompareItem[] }) {
  const all = items.flatMap((i) => i.v2v);
  if (!all.length) return <p className="text-muted">No measured turns.</p>;
  const hi = Math.max(1600, ...all) * 1.05;
  const x = (v: number) => `${(v / hi) * 100}%`;
  const ticks = [0, 500, 1000, 1500, 2000, 3000, 4000].filter((t) => t <= hi);
  return (
    <div>
      <div className="relative ml-9 mr-1">
        {[800, 1500].map((t) => (
          <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: x(t) }} />
        ))}
        <ul className="relative space-y-1">
          {items.map((it, k) => {
            const s = [...it.v2v].sort((a, b) => a - b);
            return (
              <li key={it.session.id} className="relative h-11" >
                <span className="absolute -left-9 top-1/2 -translate-y-1/2"><Tag i={k} /></span>
                <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line/60" />
                {s.length > 0 && (
                  <span aria-hidden className="absolute top-1/2 h-4 -translate-y-1/2 rounded-[4px] bg-ink/10"
                        style={{ left: x(pct(s, 25)), width: `calc(${x(pct(s, 75))} - ${x(pct(s, 25))})`, minWidth: 2 }} />
                )}
                {it.v2v.map((v, i) => (
                  <span key={i} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink"
                        style={{ left: x(v) }} title={`Session ${LETTERS[k]}: ${fmtMs(v)}`} />
                ))}
                {s.length > 0 && (
                  <span aria-hidden className="absolute top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                        style={{ left: x(pct(s, 50)) }} />
                )}
              </li>
            );
          })}
        </ul>
        <div className="relative mt-2 h-5 text-[11px] text-muted">
          {ticks.map((t) => (
            <span key={t} className="num absolute -translate-x-1/2" style={{ left: x(t) }}>{t === 0 ? "0" : `${t / 1000}s`}</span>
          ))}
        </div>
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer select-none font-medium text-ink">Show data</summary>
        <table className="num mt-2 w-full text-left">
          <tbody>
            {items.map((it, k) => (
              <tr key={it.session.id} className="border-t border-line/60 align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium">Session {LETTERS[k]}</th>
                <td className="py-1.5">{it.v2v.length ? it.v2v.map((v) => fmtMs(v)).join(", ") : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-3 text-xs text-muted">
        Each dot is one turn. The bar is the middle half of turns; the tall tick is the median. Lines mark 0.8 s and 1.5 s.
      </p>
    </div>
  );
}

function Table({ items }: { items: CompareItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-3 pr-4 font-medium">Measure</th>
            {items.map((_, k) => <th key={k} className="px-4 py-3 font-medium">Session {LETTERS[k]}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const vals = items.map(r.get);
            const b = r.best ? bestValue(vals) : null;
            return (
              <tr key={r.label} className="border-t border-line/60">
                <th scope="row" className="py-3 pr-4 font-medium">
                  {r.label}
                  <span className="block text-xs font-normal text-muted">{r.hint}</span>
                </th>
                {vals.map((v, k) => (
                  <td key={k} className={`num px-4 py-3 ${vals[k] != null && vals[k] === b ? "font-semibold" : ""}`}>
                    {v == null ? <span className="text-muted">n/a</span> : r.fmt(v)}
                    {vals[k] != null && vals[k] === b && <span className="ml-2 rounded-full bg-good/10 px-2 py-0.5 text-[11px] font-medium text-good">Best</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="panel rounded-panel p-5 sm:p-6">
      <h2 className="display text-[22px] leading-7">{title}</h2>
      {sub && <p className="mb-5 mt-1 text-xs text-muted">{sub}</p>}
      {!sub && <div className="mb-5" />}
      {children}
    </section>
  );
}

export function CompareView({ items }: { items: CompareItem[] }) {
  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, k) => (
          <li key={it.session.id} className="panel flex items-start gap-3 rounded-panel p-4">
            <Tag i={k} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" title={stackName(it.session)}>{it.session.llm_model ?? it.session.llm_provider}</p>
              <p className="truncate text-xs text-muted">{it.session.stt_provider} · {it.session.tts_provider}{it.session.tts_voice ? ` ${it.session.tts_voice}` : ""}</p>
              <p className="truncate text-xs text-muted">{it.session.persona_name}{it.session.prompt_hash ? ` · ${it.session.prompt_hash}` : ""}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="panel marks rounded-panel p-5 sm:p-8"><Verdict items={items} /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Where the time goes" sub="Average per step, same scale for every session.">
          <StageBars items={items} />
        </Card>
        <Card title="Response times, turn by turn" sub="Voice-to-voice time per turn.">
          <Strip items={items} />
        </Card>
      </div>
      <Card title="Side by side"><Table items={items} /></Card>
    </div>
  );
}
