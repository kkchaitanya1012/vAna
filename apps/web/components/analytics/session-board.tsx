"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioReplay, type ReplayHandle } from "@/components/analytics/audio-replay";
import { DataTable } from "@/components/analytics/data-table";
import { InfoTip } from "@/components/analytics/info-tip";
import { InsightChart, type ChartPoint } from "@/components/analytics/insight-chart";
import { StageBreakdown } from "@/components/analytics/stage-breakdown";
import { TranscriptPanel } from "@/components/analytics/transcript-panel";
import { Waterfall } from "@/components/analytics/waterfall";
import type { AudioInfo, TurnOut } from "@/lib/api";
import { turnLabel } from "@/lib/format";
import { stageValues } from "@/lib/stages";

function Card({ title, hint, children, className = "" }: { title: string; hint: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel rounded-panel p-5 sm:p-6 ${className}`}>
      <h2 className="mb-5 flex items-center gap-1.5 display text-[22px] leading-7">
        {title}
        <InfoTip text={hint} />
      </h2>
      {children}
    </section>
  );
}

export function SessionBoard({
  turns,
  p50,
  audio,
  replayOnly = false,
}: {
  turns: TurnOut[];
  p50: number | null;
  audio: AudioInfo | null;
  replayOnly?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const replay = useRef<ReplayHandle>(null);

  // Picking a turn anywhere also moves the recording to it. Playback moving into a turn only highlights it.
  const pick = useCallback((idx: number | null) => {
    setSelected(idx);
    if (idx != null) replay.current?.seekToTurn(idx);
  }, []);
  const [showData, setShowData] = useState(false);

  const points: ChartPoint[] = useMemo(
    () =>
      turns
        .filter((t) => t.stages.v2v != null)
        .map((t) => ({
          idx: t.idx,
          label: turnLabel(t.idx, !!t.user_text),
          total: t.stages.v2v as number,
          stages: stageValues(t.stages),
        })),
    [turns],
  );

  // j / k step through turns, Escape clears the selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return setSelected(null);
      if (e.key !== "j" && e.key !== "k") return;
      const idxs = turns.map((t) => t.idx);
      const cur = selected == null ? -1 : idxs.indexOf(selected);
      const next = e.key === "j" ? Math.min(cur + 1, idxs.length - 1) : Math.max(cur - 1, 0);
      pick(idxs[next]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turns, selected, pick]);

  const conversation = (fill: boolean) => (
    <TranscriptPanel turns={turns} selected={selected} onSelect={pick} fill={fill} />
  );

  return (
    <div className="space-y-5">
      {audio && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card title="Replay" hint="The recording of this call. You are on the top track, the agent on the bottom one. Click a turn anywhere to jump to it. Space plays and pauses.">
            <AudioReplay
              audio={audio}
              turns={turns}
              selected={selected}
              onFollow={setSelected}
              onSeekTurn={pick}
              handle={replay}
            />
          </Card>
          {/* The row takes the replay card's height; the conversation scrolls inside it */}
          <section className="panel relative rounded-panel p-6">
            <h2 className="mb-5 flex items-center gap-1.5 display text-[22px] leading-7">
              Conversation
              <InfoTip text="What was said in each turn, with its response time. It follows the recording while it plays." />
            </h2>
            <div className="lg:absolute lg:inset-x-6 lg:bottom-6 lg:top-[4.25rem]">{conversation(true)}</div>
          </section>
        </div>
      )}
      {!replayOnly && (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Response time by turn" hint="How long the caller waited between finishing a sentence and hearing the agent start to answer. Click a point to inspect that turn.">
              {points.length > 0 ? (
                <InsightChart points={points} p50={p50} selected={selected} onSelect={pick} />
              ) : (
                <p className="text-muted">Needs at least one turn where you spoke and the agent answered.</p>
              )}
            </Card>
            <Card title="Where the time goes" hint="Average of each step across all answered turns. The slowest step is the best place to improve.">
              <StageBreakdown turns={turns} />
            </Card>
          </div>

          {audio ? (
            <Card title="Turn by turn" hint="Each bar is one turn, split by step. Bars share one scale, so a longer bar is a slower response. Press j and k to step through turns.">
              <Waterfall turns={turns} selected={selected} onSelect={pick} />
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card title="Turn by turn" hint="Each bar is one turn, split by step. Bars share one scale, so a longer bar is a slower response. Press j and k to step through turns.">
                <Waterfall turns={turns} selected={selected} onSelect={pick} />
              </Card>
              <Card title="Conversation" hint="What was said in each turn, with its response time.">
                {conversation(false)}
              </Card>
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={() => setShowData((s) => !s)} aria-expanded={showData}
                    className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
              {showData ? "Hide data" : "Show data"}
            </button>
          </div>
          {showData && (
            <Card title="Data" hint="The numbers behind the charts, in milliseconds or seconds.">
              <DataTable turns={turns} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
