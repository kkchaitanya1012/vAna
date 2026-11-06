"use client";

import { Microphone, SpeakerHigh } from "@phosphor-icons/react";
import { useEffect, useRef, type RefObject } from "react";
import type { Activity } from "@/components/voice-orb";

const BARS = 8;
const STAGE_VARS = ["var(--stage-hear)", "var(--stage-think)", "var(--stage-voice)", "var(--stage-deliver)"];

function Bars({ level, synthetic, color }: { level: RefObject<number>; synthetic: boolean; color: (i: number) => string }) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let lvl = 0;
    const tick = (t: number) => {
      let target = level.current;
      if (synthetic) target = Math.max(target, 0.4 + 0.25 * Math.sin(t / 170));
      lvl += (target - lvl) * 0.22;
      const kids = wrap.current?.children;
      if (kids) {
        for (let i = 0; i < kids.length; i++) {
          const wobble = reduce ? 0 : 0.5 + 0.5 * Math.sin(t / 130 + i * 1.3);
          const h = 0.18 + lvl * (0.45 + 0.37 * wobble);
          (kids[i] as HTMLElement).style.transform = `scaleY(${Math.min(h, 1)})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level, synthetic]);

  return (
    <div ref={wrap} className="flex h-5 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="h-full w-[3px] origin-center rounded-full" style={{ background: color(i), transform: "scaleY(0.18)" }} />
      ))}
    </div>
  );
}

function Dots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-ink"
          style={{ animation: "dot 1.2s ease-in-out infinite", animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

const LABEL: Record<Activity, string> = {
  idle: "Not connected",
  connecting: "Connecting",
  listening: "Listening",
  user: "You",
  thinking: "Thinking",
  bot: "Agent",
};

export function SpeakingIndicator({
  state,
  localLevel,
  remoteLevel,
}: {
  state: Activity;
  localLevel: RefObject<number>;
  remoteLevel: RefObject<number>;
}) {
  return (
    <div
      className="glass flex h-11 min-w-[9.5rem] items-center justify-center gap-3 rounded-full px-5 text-[13px] font-medium"
      role="status"
      aria-live="polite"
    >
      {state === "user" && (
        <>
          <Microphone size={18} weight="fill" className="text-ink" aria-hidden />
          <Bars level={localLevel} synthetic={false} color={() => "var(--text)"} />
        </>
      )}
      {state === "bot" && (
        <>
          <SpeakerHigh size={18} weight="fill" className="text-ink" aria-hidden />
          <Bars level={remoteLevel} synthetic color={(i) => STAGE_VARS[i % 4]} />
        </>
      )}
      {state === "thinking" && <Dots />}
      {(state === "listening" || state === "idle" || state === "connecting") && (
        <span
          aria-hidden
          className={`size-2 rounded-full ${state === "listening" ? "bg-ink" : "bg-muted"}`}
        />
      )}
      <span className="text-ink">{LABEL[state]}</span>
    </div>
  );
}
