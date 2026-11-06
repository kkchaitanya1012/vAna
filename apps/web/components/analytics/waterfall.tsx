"use client";

import { fmtMs, latencyTone, TONE_TEXT, turnLabel } from "@/lib/format";
import { STAGES, stageValues } from "@/lib/stages";
import type { TurnOut } from "@/lib/api";

function niceMax(v: number): number {
  const step = v > 4000 ? 1000 : 500;
  return Math.max(1000, Math.ceil(v / step) * step);
}

export function Waterfall({
  turns,
  selected,
  onSelect,
}: {
  turns: TurnOut[];
  selected: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const totals = turns.map((t) => t.stages.v2v).filter((v): v is number => v != null);
  const top = niceMax(Math.max(...totals, 0));
  const ticks = [0, 0.5, 1].map((f) => f * top);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Legend">
        {STAGES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-xs text-muted" title={s.tech}>
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-x-3 px-2 pb-2 text-[11px] text-muted">
        <span />
        <span className="num relative block h-4">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute top-0 whitespace-nowrap"
              style={{ left: `${(t / top) * 100}%`, transform: `translateX(-${i * 50}%)` }}
            >
              {t === 0 ? "0" : t >= 1000 ? `${t / 1000} s` : `${t} ms`}
            </span>
          ))}
        </span>
        <span />
      </div>

      <ul className="space-y-1">
        {turns.map((t) => {
          const v = t.stages.v2v;
          const vals = stageValues(t.stages);
          const on = selected === t.idx;
          const label = turnLabel(t.idx, !!t.user_text);
          return (
            <li key={t.idx}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : t.idx)}
                aria-label={`${label}, response time ${fmtMs(v)}`}
                className={`grid w-full grid-cols-[5.5rem_1fr_4.5rem] items-center gap-x-3 rounded-panel px-2 py-2.5 text-left transition-colors duration-150 ${
                  on ? "bg-raised ring-1 ring-[var(--border-strong)]" : "hover:bg-surface-2"
                }`}
              >
                <span className="flex flex-col text-[13px] font-medium leading-tight">
                  {label}
                  {t.interrupted && <span className="text-[11px] font-normal text-warn" title="You started speaking while the agent was answering">Cut off</span>}
                </span>
                {v == null ? (
                  <span className="text-xs text-muted">{t.user_text ? "No reply" : "The agent spoke first"}</span>
                ) : (
                  <span className="flex h-6 items-center gap-[2px]">
                    {STAGES.map((s, i) => {
                      const val = vals[s.key];
                      if (!val || val <= 0) return null;
                      const last = STAGES.slice(i + 1).every((n) => !vals[n.key]);
                      return (
                        <span
                          key={s.key}
                          className={`group relative block h-full rounded-[3px] ${last ? "rounded-r-[6px]" : ""}`}
                          style={{ width: `${(val / top) * 100}%`, minWidth: 2, background: s.color }}
                        >
                          <span
                            role="tooltip"
                            className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-xl border border-[var(--border-strong)] bg-[var(--raised)] px-2.5 py-1.5 text-xs opacity-0 shadow-lg  transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                          >
                            <span className="font-medium">{s.label}</span>{" "}
                            <span className="num">{fmtMs(val)}</span>
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}
                <span className={`num text-right text-[13px] font-semibold ${v != null ? TONE_TEXT[latencyTone(v)] : "text-muted"}`}>
                  {fmtMs(v)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
