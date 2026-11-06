import type { Tone } from "@/lib/format";

/** Verdict mark that does not rely on color: circle = natural, triangle = noticeable, square = slow. */
export function ToneGlyph({ tone, size = 12 }: { tone: Tone; size?: number }) {
  const c = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {tone === "good" && <circle cx="6" cy="6" r="5" fill={c} />}
      {tone === "warn" && <path d="M6 1 11.2 10.5H.8z" fill={c} />}
      {tone === "bad" && <rect x="1" y="1" width="10" height="10" rx="1.5" fill={c} />}
    </svg>
  );
}
