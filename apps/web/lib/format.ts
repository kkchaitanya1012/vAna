export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "n/a";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export type Tone = "good" | "warn" | "bad";

/** Thresholds from DESIGN.md: under 0.8 s feels natural, over 1.5 s feels slow. */
export function latencyTone(ms: number): Tone {
  return ms < 800 ? "good" : ms <= 1500 ? "warn" : "bad";
}

export const TONE_TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad" };
export const TONE_PILL: Record<Tone, string> = {
  good: "text-good bg-good/10",
  warn: "text-warn bg-warn/10",
  bad: "text-bad bg-bad/10",
};

export function latencyVerdict(ms: number): string {
  return ms < 800 ? "Feels natural" : ms <= 1500 ? "Noticeable pause" : "Feels slow";
}

export function turnLabel(idx: number, hasUser: boolean): string {
  return idx === 0 && !hasUser ? "Greeting" : `Turn ${idx}`;
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "n/a";
  if (v === 0) return "$0";
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}
