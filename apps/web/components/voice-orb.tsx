"use client";

import { useEffect, useRef, type RefObject } from "react";

export type Activity = "idle" | "connecting" | "listening" | "user" | "thinking" | "bot";

/**
 * The orb scales with live audio. Levels arrive through refs and are written
 * straight to the DOM each frame, so React never re-renders per audio frame.
 */
export function VoiceOrb({
  state,
  localLevel,
  remoteLevel,
}: {
  state: Activity;
  localLevel: RefObject<number>;
  remoteLevel: RefObject<number>;
}) {
  const lens = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const bloom = useRef<HTMLDivElement>(null);
  const stateRef = useRef<Activity>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let level = 0;
    const tick = (t: number) => {
      const s = stateRef.current;
      let target = 0;
      if (s === "user") target = Math.max(localLevel.current, 0.08);
      else if (s === "bot") {
        // Fall back to a gentle synthetic pulse if the remote level is not reported.
        target = Math.max(remoteLevel.current, 0.3 + 0.2 * Math.sin(t / 190));
      }
      level += (target - level) * 0.18;
      // The lens breathes with the voice; the ring and bloom follow a beat behind.
      if (lens.current) lens.current.style.transform = `scale(${1 - level * 0.07})`;
      if (ring.current) ring.current.style.scale = String(1 + level * 0.08);
      if (bloom.current) bloom.current.style.scale = String(1 + level * 0.3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [localLevel, remoteLevel]);

  return (
    <div className="orb" data-state={state} role="img" aria-label={`Voice agent, ${state}`}>
      <div ref={bloom} className="orb-bloom" />
      <div ref={ring} className="orb-ring" />
      <div ref={lens} className="orb-lens">
        <div className="orb-iris" />
      </div>
    </div>
  );
}
