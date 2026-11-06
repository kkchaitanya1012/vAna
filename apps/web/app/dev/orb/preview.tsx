"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { SpeakingIndicator } from "@/components/speaking-indicator";
import { TranscriptLane, type Line } from "@/components/transcript-lane";
import { VoiceOrb, type Activity } from "@/components/voice-orb";

const STATES: Activity[] = ["idle", "connecting", "listening", "user", "thinking", "bot"];

const LINES: Line[] = [
  { id: 1, role: "bot", text: "Hi, I'm your voice assistant. How can I help today?" },
  { id: 2, role: "user", text: "Can you explain how a car engine works?" },
  { id: 3, role: "bot", text: "Sure. Fuel and air burn in cylinders, pushing pistons that turn the crankshaft." },
  { id: 4, role: "user", text: "And what does the gearbox do?" },
  { id: 5, role: "bot", text: "It trades speed for torque, so the engine can stay in its efficient range." },
];

/** Design preview: every orb state with simulated audio levels. Not part of the product flow. */
export function OrbPreview() {
  const params = useSearchParams();
  const state = (STATES.includes(params.get("state") as Activity) ? params.get("state") : "bot") as Activity;
  const local = useRef(0);
  const remote = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const v = 0.45 + 0.4 * Math.sin(t / 140) * Math.sin(t / 560);
      local.current = Math.max(v, 0);
      remote.current = Math.max(v * 0.9, 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-between gap-8">
      <nav className="glass flex gap-1 rounded-full p-1 text-[13px]">
        {STATES.map((s) => (
          <a
            key={s}
            href={`?state=${s}`}
            className={`rounded-full px-3 py-1.5 capitalize ${s === state ? "bg-ink/10 text-ink" : "text-muted"}`}
          >
            {s}
          </a>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-10">
        <VoiceOrb state={state} localLevel={local} remoteLevel={remote} />
        <SpeakingIndicator state={state} localLevel={local} remoteLevel={remote} />
      </div>
      <TranscriptLane lines={LINES} interim={state === "user" ? "and what does the gear" : ""} empty="" />
    </div>
  );
}
