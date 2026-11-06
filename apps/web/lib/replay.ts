import type { TurnOut } from "@/lib/api";

/** Event time (ms since session start) to audio time (ms into the recording). */
export const toAudioMs = (eventMs: number, offsetMs: number) => eventMs - offsetMs;

/** Where a turn begins in event time: when the user started, or the bot for the greeting. */
export function turnStartMs(t: TurnOut): number | null {
  return t.user_start_ms ?? t.bot_start_ms;
}

/** Index of the turn that is playing at the given event time. */
export function turnAt(turns: TurnOut[], eventMs: number): number | null {
  let hit: number | null = null;
  for (const t of turns) {
    const s = turnStartMs(t);
    if (s != null && s <= eventMs) hit = t.idx;
  }
  return hit;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
