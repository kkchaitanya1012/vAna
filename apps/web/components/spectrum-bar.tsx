import { STAGES, stageValues } from "@/lib/stages";
import { fmtMs } from "@/lib/format";

export type SpectrumPart = { key: string; label: string; color: string; ms: number };

/** Average stage times of a session as parts of one bar. Zero parts are dropped. */
export function stageParts(avg: Record<string, number | null> | undefined): SpectrumPart[] {
  const sv = stageValues(avg ?? {});
  return STAGES.map((s) => ({ key: s.key, label: s.label, color: s.color, ms: sv[s.key] ?? 0 }));
}

/**
 * Response time drawn as light split into its four stages. Width is proportional to time.
 * `scale` sets the width of the whole bar relative to its row, so rows can share one scale.
 */
export function SpectrumBar({
  parts, height = 10, scale = 1, flat = false, vial = false, label,
}: {
  parts: SpectrumPart[];
  height?: number;
  scale?: number;
  flat?: boolean;
  vial?: boolean;
  label?: string;
}) {
  const shown = parts.filter((p) => p.ms > 0);
  const total = shown.reduce((a, b) => a + b.ms, 0);
  if (!total) return <div className="h-px w-full bg-line" aria-hidden />;
  const bar = (
    <div
      className={`spectrum ${flat ? "flat" : ""}`}
      style={{ ["--h" as string]: `${height}px`, width: vial ? "100%" : `${scale * 100}%` }}
      role="img"
      aria-label={label ?? `${fmtMs(total)}: ${shown.map((p) => `${p.label} ${fmtMs(p.ms)}`).join(", ")}`}
    >
      {shown.map((p) => (
        <span key={p.key} style={{ ["--c" as string]: p.color, flex: `${p.ms} 1 0` }} />
      ))}
    </div>
  );
  // The vial is the glass tube; the liquid fills `scale` of it from the left.
  return vial ? (
    <div className="vial">
      <div style={{ width: `${scale * 100}%` }}>{bar}</div>
    </div>
  ) : bar;
}
