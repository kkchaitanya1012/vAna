import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Readout } from "@/components/analytics/readout";
import { SessionBoard } from "@/components/analytics/session-board";
import { PageSkeleton } from "@/components/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { SpectrumBar, stageParts } from "@/components/spectrum-bar";
import { ToneGlyph } from "@/components/tone-glyph";
import { ApiError, getSession, listSessions, type SessionDetail } from "@/lib/api";
import { fmtMs, fmtUsd, latencyTone, latencyVerdict } from "@/lib/format";
import { STAGES, stageValues } from "@/lib/stages";

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span className={`rounded-full border border-line px-3 py-1 text-xs text-muted ${mono ? "mono" : ""}`}>{children}</span>
  );
}

async function previousP50(s: SessionDetail): Promise<number | null> {
  try {
    const all = await listSessions();
    const prev = all.find(
      (o) => o.id !== s.id && o.status === "complete" && o.summary?.v2v_p50 != null && o.created_at < s.created_at,
    );
    return prev?.summary?.v2v_p50 ?? null;
  } catch {
    return null;
  }
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s: SessionDetail;
  try {
    s = await getSession(id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    return (
      <div role="alert" className="panel max-w-md rounded-panel border-bad/40 p-6">
        <p className="text-bad">{e instanceof Error ? e.message : "Could not load this session."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/sessions/${id}`} className="btn">Try again</Link>
          <Link href="/sessions" className="btn btn-quiet">All sessions</Link>
        </div>
      </div>
    );
  }

  const sum = s.summary;
  const prev = await previousP50(s);
  const answered = s.turns.filter((t) => t.stages.v2v != null);

  // Slowest step across answered turns
  const avgs = STAGES.map((st) => {
    const xs = s.turns.map((t) => stageValues(t.stages)[st.key]).filter((v): v is number => v != null);
    return { ...st, ms: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
  });
  const totalAvg = avgs.reduce((a, b) => a + b.ms, 0);
  const axisMax = Math.max(2000, Math.ceil((totalAvg * 1.06) / 500) * 500);
  const slowest = avgs.reduce((a, b) => (b.ms > a.ms ? b : a), avgs[0]);

  const p50 = sum?.v2v_p50 ?? null;
  const delta =
    p50 != null && prev != null
      ? Math.abs(p50 - prev) < 5
        ? { text: "Same as previous session", good: true }
        : { text: `${p50 - prev < 0 ? "-" : "+"}${fmtMs(Math.abs(p50 - prev))} vs previous session`, good: p50 - prev < 0 }
      : null;

  const dur = duration(s.started_at, s.ended_at);
  const ended = s.status !== "starting" && s.status !== "live";

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display text-[34px] leading-none sm:text-[44px]">Session</h1>
            <StatusBadge status={s.status} />
          </div>
          <p suppressHydrationWarning className="mt-2 text-[13px] text-muted">
            {new Date(s.created_at).toLocaleString()}
            {dur ? ` · ${dur}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{s.persona_name}{s.prompt_version ? ` v${s.prompt_version}` : s.prompt_hash ? ` · ${s.prompt_hash}` : ""}</Chip>
          <Chip mono>{s.llm_model ?? s.llm_provider}</Chip>
          <Chip>{s.stt_provider} · {s.tts_provider}</Chip>
        </div>
      </div>

      {s.error && (
        <p role="alert" className="panel max-w-xl rounded-panel border-bad/40 px-4 py-3 text-bad">{s.error}</p>
      )}

      {s.status === "starting" || s.status === "live" ? (
        <div className="panel max-w-xl rounded-panel p-6">
          <p className="text-muted">This session has not ended yet. Analytics appear when it does.</p>
          <Link href={`/live/${s.id}`} className="btn mt-4">Back to the call</Link>
        </div>
      ) : answered.length === 0 ? (
        <div className="panel max-w-xl rounded-panel p-7">
          <h2 className="display text-[24px]">No response times yet</h2>
          <p className="mt-2 text-muted">
            Response time needs a turn where you spoke and the agent answered. This session only has the greeting.
            Start another call and say something after the greeting.
          </p>
          <Link href="/" className="btn mt-5">New session</Link>
        </div>
      ) : null}
      {ended && answered.length === 0 && s.audio ? (
        <SessionBoard turns={s.turns} p50={null} audio={s.audio} replayOnly />
      ) : !ended || answered.length === 0 ? null : (
        <>
          {p50 != null && totalAvg > 0 && (
            <section className="panel marks rounded-panel p-6 sm:p-12" aria-labelledby="verdict">
              <p id="verdict" className="rise flex items-center gap-2.5 text-[14px] font-medium text-muted" style={{ ["--i" as string]: 0 }}>
                <ToneGlyph tone={latencyTone(p50)} />
                {latencyVerdict(p50)}
              </p>
              <p className="display display-xl rise mt-4 max-w-5xl text-balance text-[40px] leading-[0.98] sm:text-[88px]" style={{ ["--i" as string]: 1 }}>
                The agent took <span className="whitespace-nowrap">{fmtMs(p50)}</span> to answer.{" "}
                <span className="text-muted">
                  Most of that was {slowest.label.toLowerCase()}.
                </span>
              </p>
              <div className="rise mt-10 sm:mt-14" style={{ ["--i" as string]: 2 }}>
                <div className="relative pb-1">
                  <SpectrumBar vial parts={stageParts(sum?.stage_avg)} height={26} scale={totalAvg / axisMax} />
                  {[800, 1500].filter((t) => t < axisMax).map((t) => (
                    <span key={t} aria-hidden className="absolute -bottom-7 top-0 w-px border-l border-dashed border-line-strong" style={{ left: `${(t / axisMax) * 100}%` }}>
                      <span className="num absolute -bottom-0.5 left-1.5 hidden translate-y-full whitespace-nowrap text-[11px] text-muted sm:block">
                        {t === 800 ? "0.8 s natural" : "1.5 s slow"}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="caption mb-10 mt-14">Plate {String(s.turns.length).padStart(2, "0")}. Call {s.id.slice(0, 8)}, {s.persona_name}. Average time in each step across answered turns.</p>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  {avgs.map((a) => (
                    <li key={a.key}>
                      <p className="flex items-center gap-2 text-[13px] font-medium">
                        <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: a.color }} />
                        {a.label}
                      </p>
                      <p className="display mt-1 text-[28px] leading-8">{fmtMs(a.ms)}</p>
                      <p className="num text-xs text-muted">{totalAvg ? Math.round((a.ms / totalAvg) * 100) : 0}% of the wait</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <Readout
            items={[
              {
                label: "Typical response",
                value: fmtMs(p50),
                hint: "Median time between you finishing a sentence and the agent starting to answer. Half the turns were faster than this.",
                note: p50 != null ? latencyVerdict(p50) : undefined,
                tone: p50 != null ? latencyTone(p50) : undefined,
                delta,
              },
              {
                label: "Slowest responses",
                value: fmtMs(sum?.v2v_p95 ?? null),
                hint: "The 95th percentile: 19 out of 20 turns answered faster than this. It shows the worst waits a caller feels.",
                note: sum?.v2v_p95 != null ? latencyVerdict(sum.v2v_p95) : undefined,
                tone: sum?.v2v_p95 != null ? latencyTone(sum.v2v_p95) : undefined,
              },
              {
                label: "Estimated cost",
                value: fmtUsd(sum?.cost_usd?.total),
                hint: "Speech to text by call length, the language model by tokens, and voice by characters, using the prices in config/providers.yaml. Prices are estimates. When a price is unknown that part is left out, so the total is a lower bound.",
                note: sum?.cost_usd?.complete === false ? "Partial: a price is unknown" : `${(sum?.tokens_in ?? 0) + (sum?.tokens_out ?? 0)} tokens, ${sum?.tts_chars ?? 0} characters`,
              },
              {
                label: "Turns answered",
                value: String(sum?.responded_turns ?? answered.length),
                hint: "Turns where the agent replied, including its opening greeting.",
                note: `${answered.length} with a response time`,
              },
              {
                label: "Cut-offs",
                value: String(sum?.interruptions ?? 0),
                hint: "Times you started speaking while the agent was still answering.",
                note: (sum?.interruptions ?? 0) === 0 ? "No interruptions" : "Turns where you spoke over the agent",
              },
              {
                label: "Slowest step",
                value: slowest.label,
                hint: `${slowest.tech}. Average over all answered turns.`,
                note: `${fmtMs(slowest.ms)} on average`,
              },
            ]}
          />

          <SessionBoard turns={s.turns} p50={p50} audio={s.audio} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted">
        <span className="mono">{s.id}</span>
        <Link href="/sessions" className="underline-offset-4 hover:text-ink hover:underline">All sessions</Link>
      </div>
    </div>
  );
}

export default function SessionPage(props: PageProps<"/sessions/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
