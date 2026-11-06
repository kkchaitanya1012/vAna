"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { SessionTimeline } from "@/components/analytics/session-timeline";
import { API_URL, type AudioInfo, type TurnOut } from "@/lib/api";
import { fmtClock, turnAt, turnStartMs } from "@/lib/replay";

export type ReplayHandle = { seekToTurn: (idx: number) => void };

const SPEEDS = [1, 1.5, 2];

type Wave = import("wavesurfer.js").default;

export function AudioReplay({
  audio,
  turns,
  selected,
  onFollow,
  onSeekTurn,
  handle,
}: {
  audio: AudioInfo;
  turns: TurnOut[];
  selected: number | null;
  onFollow: (idx: number) => void; // playback moved into another turn
  onSeekTurn: (idx: number) => void; // the user clicked a turn on the timeline
  handle: Ref<ReplayHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<Wave | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const followRef = useRef({ turns, selected, onFollow, offset: audio.offset_ms });

  useEffect(() => {
    followRef.current = { turns, selected, onFollow, offset: audio.offset_ms };
  }, [turns, selected, onFollow, audio.offset_ms]);

  useEffect(() => {
    let dead = false;
    let instance: Wave | null = null;
    (async () => {
      const { default: WaveSurfer } = await import("wavesurfer.js");
      if (dead || !box.current) return;
      const css = getComputedStyle(document.documentElement);
      const user = css.getPropertyValue("--speaker-user").trim();
      const bot = css.getPropertyValue("--speaker-bot").trim();
      instance = WaveSurfer.create({
        container: box.current,
        url: `${API_URL}${audio.url}`,
        height: 96,
        splitChannels: [
          { waveColor: user, progressColor: user, overlay: false },
          { waveColor: bot, progressColor: bot, overlay: false },
        ],
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        cursorColor: css.getPropertyValue("--accent").trim(),
        cursorWidth: 2,
        normalize: true,
        dragToSeek: true,
      });
      ws.current = instance;
      instance.on("ready", () => setReady(true));
      instance.on("error", () => setError("Could not load the recording."));
      instance.on("play", () => setPlaying(true));
      instance.on("pause", () => setPlaying(false));
      instance.on("finish", () => setPlaying(false));
      instance.on("timeupdate", (sec: number) => {
        const ms = sec * 1000;
        setTimeMs(ms);
        const f = followRef.current;
        const idx = turnAt(f.turns, ms + f.offset);
        if (idx != null && idx !== f.selected && instance?.isPlaying()) f.onFollow(idx);
      });
    })();
    return () => {
      dead = true;
      instance?.destroy();
      ws.current = null;
    };
  }, [audio.url]);

  const seekToTurn = useCallback(
    (idx: number) => {
      const t = turns.find((x) => x.idx === idx);
      const start = t ? turnStartMs(t) : null;
      if (!ws.current || start == null) return;
      const sec = Math.max(0, (start - audio.offset_ms - 400) / 1000); // a short lead-in
      ws.current.setTime(Math.min(sec, audio.duration_ms / 1000));
    },
    [turns, audio.offset_ms, audio.duration_ms],
  );
  useImperativeHandle(handle, () => ({ seekToTurn }), [seekToTurn]);

  const toggle = useCallback(() => {
    ws.current?.playPause();
  }, []);

  // Space plays or pauses from anywhere except text fields. After clicking a turn, focus stays on that
  // button, and Space should still play. Enter keeps activating focused buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  function setRate(r: number) {
    setSpeed(r);
    ws.current?.setPlaybackRate(r, true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
          className="btn size-10 !p-0 disabled:opacity-40"
        >
          {playing ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
        </button>
        <span className="num text-[13px] text-muted">
          {fmtClock(timeMs)} / {fmtClock(audio.duration_ms)}
        </span>
        <div className="ml-auto flex gap-1 rounded-full bg-ink/[0.05] p-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRate(r)}
              aria-pressed={speed === r}
              className={`num rounded-full px-3 py-1 text-xs font-medium transition-colors ${speed === r ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"}`}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[3.25rem_1fr] gap-x-3">
        <div className="flex flex-col justify-around py-1 text-xs text-muted" aria-hidden>
          <span>You</span>
          <span>Agent</span>
        </div>
        <div ref={box} className="min-h-24" />
      </div>
      {!ready && !error && <p className="mt-2 text-xs text-muted">Loading the recording</p>}
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}

      <SessionTimeline
        turns={turns}
        offsetMs={audio.offset_ms}
        durationMs={audio.duration_ms}
        currentMs={timeMs}
        selected={selected}
        onSeek={onSeekTurn}
      />
    </div>
  );
}
