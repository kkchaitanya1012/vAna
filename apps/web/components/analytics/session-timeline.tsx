"use client";

import type { TurnOut } from "@/lib/api";
import { fmtClock, toAudioMs } from "@/lib/replay";
import { turnLabel } from "@/lib/format";

type Seg = { turn: number; label: string; a: number; b: number };

/** Two lanes on the recording's own time axis: who spoke when. Click a segment to jump there. */
export function SessionTimeline({
  turns,
  offsetMs,
  durationMs,
  currentMs,
  selected,
  onSeek,
}: {
  turns: TurnOut[];
  offsetMs: number;
  durationMs: number;
  currentMs: number;
  selected: number | null;
  onSeek: (turnIdx: number) => void;
}) {
  const pct = (ms: number) => `${Math.min(Math.max((ms / durationMs) * 100, 0), 100)}%`;
  const user: Seg[] = [];
  const bot: Seg[] = [];
  const cuts: number[] = [];

  turns.forEach((t, i) => {
    const label = turnLabel(t.idx, !!t.user_text);
    if (t.user_start_ms != null && t.user_stop_ms != null) {
      user.push({ turn: t.idx, label, a: toAudioMs(t.user_start_ms, offsetMs), b: toAudioMs(t.user_stop_ms, offsetMs) });
    }
    if (t.bot_start_ms != null && t.bot_stop_ms != null) {
      bot.push({ turn: t.idx, label, a: toAudioMs(t.bot_start_ms, offsetMs), b: toAudioMs(t.bot_stop_ms, offsetMs) });
    }
    const next = turns[i + 1];
    if (t.interrupted && next?.user_start_ms != null) cuts.push(toAudioMs(next.user_start_ms, offsetMs));
  });

  const step = durationMs > 240_000 ? 60_000 : durationMs > 90_000 ? 30_000 : durationMs > 40_000 ? 10_000 : 5_000;
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += step) ticks.push(t);

  const lane = (segs: Seg[], color: string, who: string) => (
    <div className="relative h-4 rounded-full bg-ink/[0.05]">
      {segs.map((s) => {
        const on = selected === s.turn;
        return (
          <button
            key={`${who}-${s.turn}`}
            type="button"
            onClick={() => onSeek(s.turn)}
            aria-label={`${s.label}, ${who} spoke ${fmtClock(s.a)} to ${fmtClock(s.b)}. Jump to it.`}
            className="absolute top-0 h-full rounded-full transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
            style={{
              left: pct(s.a),
              width: `max(${((s.b - s.a) / durationMs) * 100}%, 4px)`,
              background: color,
              opacity: on ? 1 : 0.62,
              boxShadow: on ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="relative mt-4 select-none">
      <div className="grid grid-cols-[3.25rem_1fr] items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted">You</span>
        {lane(user, "var(--speaker-user)", "you")}
        <span className="text-xs text-muted">Agent</span>
        {lane(bot, "var(--speaker-bot)", "the agent")}
      </div>

      <div className="relative ml-[3.75rem] mt-2 h-4 text-[11px] text-muted num">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: pct(t) }}>
            {fmtClock(t)}
          </span>
        ))}
      </div>

      {/* cut-off ticks and playhead share the lanes' coordinate space */}
      <div className="pointer-events-none absolute inset-y-0 left-[3.75rem] right-0">
        {cuts.map((c) => (
          <span key={c} className="absolute top-[-4px] h-[44px] w-px bg-warn" style={{ left: pct(c) }} title="You cut the agent off here" />
        ))}
        <span
          className="absolute top-[-6px] h-[48px] w-0.5 rounded-full bg-accent"
          style={{ left: pct(currentMs), transition: "left 250ms linear" }}
          aria-hidden
        />
      </div>
    </div>
  );
}
