"use client";

import { useEffect, useRef } from "react";
import { fmtMs, latencyTone, TONE_PILL, turnLabel } from "@/lib/format";
import type { TurnOut } from "@/lib/api";

export function TranscriptPanel({
  turns,
  selected,
  onSelect,
  fill = false,
}: {
  turns: TurnOut[];
  selected: number | null;
  onSelect: (idx: number | null) => void;
  fill?: boolean; // take the height of the parent card on wide screens
}) {
  const refs = useRef<Record<number, HTMLLIElement | null>>({});
  const list = useRef<HTMLUListElement>(null);
  const lastUserScroll = useRef(0);

  // Keep the active turn visible by scrolling this list only. scrollIntoView would also scroll the
  // page, which yanks the viewer away from the recording while it plays.
  useEffect(() => {
    const box = list.current;
    const el = selected != null ? refs.current[selected] : null;
    if (!box || !el) return;
    if (Date.now() - lastUserScroll.current < 4000) return; // the viewer is reading elsewhere in the list
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 8;
    let delta = 0;
    if (r.top < b.top + pad) delta = r.top - b.top - pad;
    else if (r.bottom > b.bottom - pad) delta = r.bottom - b.bottom + pad;
    if (delta) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({ top: box.scrollTop + delta, behavior: calm ? "auto" : "smooth" });
    }
  }, [selected]);

  const markUserScroll = () => {
    lastUserScroll.current = Date.now();
  };

  return (
    <ul
      ref={list}
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
      className={`space-y-1.5 overflow-y-auto pr-1 ${fill ? "max-h-[22rem] lg:h-full lg:max-h-none" : "max-h-[34rem]"}`}
    >
      {turns.map((t) => {
        const on = selected === t.idx;
        const v = t.stages.v2v;
        return (
          <li key={t.idx} ref={(el) => { refs.current[t.idx] = el; }}>
            <button
              type="button"
              onClick={() => onSelect(on ? null : t.idx)}
              aria-pressed={on}
              className={`w-full rounded-panel px-3.5 py-3 text-left transition-colors duration-150 ${on ? "bg-raised ring-1 ring-[var(--border-strong)]" : "hover:bg-surface-2"}`}
            >
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted">
                <span>{turnLabel(t.idx, !!t.user_text)}{t.interrupted ? " · cut off" : ""}</span>
                {v != null && (
                  <span className={`num rounded-full px-2 py-0.5 ${TONE_PILL[latencyTone(v)]}`}>{fmtMs(v)}</span>
                )}
              </div>
              {t.user_text && (
                <p className="text-[13px] leading-snug">
                  <span className="mr-1.5 text-[11px] font-semibold text-ink">You</span>
                  {t.user_text}
                </p>
              )}
              {!t.user_text && !t.bot_text && <p className="text-[13px] text-muted">No words recorded.</p>}
              {t.bot_text && (
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  <span className="mr-1.5 text-[11px] font-semibold text-muted">Agent</span>
                  {t.bot_text}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
