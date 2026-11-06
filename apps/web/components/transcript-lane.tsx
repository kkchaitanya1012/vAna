"use client";

export type Line = { id: number; role: "user" | "bot"; text: string };

const VISIBLE = 5;

export function TranscriptLane({
  lines,
  interim,
  empty,
}: {
  lines: Line[];
  interim: string;
  empty: string;
}) {
  const shown: { key: string; role: Line["role"]; text: string; live?: boolean }[] = lines
    .slice(-VISIBLE)
    .map((l) => ({ key: String(l.id), role: l.role, text: l.text }));
  if (interim) shown.push({ key: "interim", role: "user", text: interim, live: true });
  const tail = shown.slice(-VISIBLE);

  return (
    <div
      className="lane-mask flex min-h-0 w-full max-w-2xl flex-1 flex-col justify-end gap-3 overflow-hidden px-2 text-center"
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {tail.length === 0 && <p className="text-base text-muted">{empty}</p>}
      {tail.map((l, i) => {
        const age = tail.length - 1 - i; // 0 = newest
        const newest = age === 0;
        return (
          <p
            key={l.key}
            className={`lane-line text-balance tracking-tight ${newest ? "text-2xl font-medium leading-snug sm:text-[28px]" : "text-lg leading-snug"}`}
            style={{
              opacity: l.live ? 0.8 : Math.max(1 - age * 0.28, 0.12),
              filter: `blur(${Math.min(age * 1.2, 4)}px)`,
            }}
          >
            <span className={`mr-2 align-middle text-xs font-medium ${l.role === "bot" ? "text-muted" : "text-ink"}`}>
              {l.role === "bot" ? "Agent" : "You"}
            </span>
            <span className={l.role === "bot" ? "text-ink/80" : "text-ink"}>{l.text}</span>
          </p>
        );
      })}
    </div>
  );
}
