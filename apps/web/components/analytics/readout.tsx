import { InfoTip } from "@/components/analytics/info-tip";
import { ToneGlyph } from "@/components/tone-glyph";
import type { Tone } from "@/lib/format";

export type ReadoutItem = {
  label: string;
  value: string;
  hint: string;
  note?: string;
  tone?: Tone;
  delta?: { text: string; good: boolean } | null;
};

/** The numbers of a session as one ruled table, not a wall of cards. */
export function Readout({ items }: { items: ReadoutItem[] }) {
  return (
    <div className="panel overflow-hidden rounded-panel">
    <dl className="-mb-px -mr-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1.5 border-b border-r border-line px-6 py-5">
          <dt className="label flex items-center gap-1.5">{it.label}<InfoTip text={it.hint} /></dt>
          <dd className="flex items-baseline gap-2.5">
            <span className="display whitespace-nowrap text-[38px] leading-10">{it.value}</span>
            {it.tone && <ToneGlyph tone={it.tone} />}
          </dd>
          <p className="flex min-h-4 flex-wrap items-center gap-x-2.5 text-xs text-muted">
            {it.note}
            {it.delta && <span className={`num font-medium ${it.delta.good ? "text-good" : "text-bad"}`}>{it.delta.text}</span>}
          </p>
        </div>
      ))}
    </dl>
    </div>
  );
}
