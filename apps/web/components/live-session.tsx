"use client";

import { PipecatClient } from "@pipecat-ai/client-js";
import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { Microphone, Stop } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SpeakingIndicator } from "@/components/speaking-indicator";
import { TranscriptLane, type Line } from "@/components/transcript-lane";
import { VoiceOrb, type Activity } from "@/components/voice-orb";
import { PageSkeleton } from "@/components/skeleton";
import { VOICE_URL, endSession } from "@/lib/api";

type Connection = "idle" | "connecting" | "connected" | "ending" | "end-failed" | "error";

export function LiveSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const clientRef = useRef<PipecatClient | null>(null);
  const [client, setClient] = useState<PipecatClient | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [activity, setActivity] = useState<Activity>("listening");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const nextId = useRef(0);
  const localLevel = useRef(0);
  const remoteLevel = useRef(0);

  useEffect(() => {
    const c = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: () => setConnection("connected"),
        onDisconnected: () => setConnection((s) => (s === "ending" ? s : "idle")),
        onLocalAudioLevel: (level) => {
          localLevel.current = level;
        },
        onRemoteAudioLevel: (level) => {
          remoteLevel.current = level;
        },
        onUserStartedSpeaking: () => setActivity("user"),
        onUserStoppedSpeaking: () => setActivity("thinking"),
        onBotStartedSpeaking: () => setActivity("bot"),
        onBotStoppedSpeaking: () => setActivity("listening"),
        onUserTranscript: (t) => {
          const text = t.text.trim();
          if (!t.final) {
            setInterim(text);
            return;
          }
          setInterim("");
          if (text) setLines((l) => [...l, { id: nextId.current++, role: "user", text }]);
        },
        onBotTranscript: (t) => {
          if (!t.text) return;
          setLines((l) => {
            const last = l[l.length - 1];
            if (last && last.role === "bot") {
              return [...l.slice(0, -1), { ...last, text: `${last.text} ${t.text}`.trim() }];
            }
            return [...l, { id: nextId.current++, role: "bot", text: t.text }];
          });
        },
        onError: (m) => {
          // The RTVI error message carries the provider's own text, for example "voice does not exist".
          const raw = m as { data?: { error?: string; message?: string }; message?: string } | undefined;
          const detail = raw?.data?.error ?? raw?.data?.message ?? raw?.message;
          setError(detail ? `The voice connection reported an error: ${detail}` : "The voice connection reported an error. Check the voice server log.");
          console.warn("pipecat error", detail ?? JSON.stringify(m));
        },
      },
    });
    clientRef.current = c;
    setClient(c);
    return () => {
      c.disconnect().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (connection !== "connected") return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [connection]);

  const connect = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    setConnection("connecting");
    setError(null);
    try {
      await c.connect({
        webrtcRequestParams: { endpoint: `${VOICE_URL}/api/offer`, requestData: { session_id: sessionId } },
      });
    } catch (e) {
      console.error(e);
      setError("Could not connect. Is the voice server running and the microphone allowed?");
      setConnection("error");
    }
  }, [sessionId]);

  const end = useCallback(async () => {
    setConnection("ending");
    try {
      await clientRef.current?.disconnect();
    } catch {}
    try {
      await endSession(sessionId);
    } catch (e) {
      console.error(e);
      setError("The call is disconnected, but the API did not confirm the end. Your recording is kept. Try ending again.");
      setConnection("end-failed");
      return;
    }
    router.push(`/sessions/${sessionId}`);
  }, [router, sessionId]);

  const live = connection === "connected";
  const orbState: Activity = live ? activity : connection === "connecting" ? "connecting" : "idle";
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (!client) return <PageSkeleton />;
  return (
    <PipecatClientProvider client={client}>
      <div className="relative mx-auto -mb-24 flex h-[calc(100dvh-8.5rem)] min-h-[25rem] w-full flex-col items-center gap-3 sm:mb-0 sm:h-[calc(100dvh-10.5rem)] sm:gap-5">
        <div className="flex w-full shrink-0 items-center justify-between text-[12px] text-muted">
          <span className="mono rounded-full border border-line px-3 py-1.5">{sessionId.slice(0, 8)}</span>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className={`size-2 rounded-full ${live ? "bg-bad" : "bg-line-strong"}`} />
            <span className="display text-[24px] leading-none text-ink" aria-label={`Call time ${mm} minutes ${ss} seconds`}>{mm}:{ss}</span>
          </span>
        </div>

        {/* The orb gives way to the window: it shrinks with the height so the controls are always on screen. */}
        <div className="flex shrink-0 items-center justify-center py-[2dvh]">
          <VoiceOrb state={orbState} localLevel={localLevel} remoteLevel={remoteLevel} />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
          <SpeakingIndicator state={orbState} localLevel={localLevel} remoteLevel={remoteLevel} />
          {(live || connection === "ending" || connection === "end-failed") ? (
            <button onClick={end} disabled={connection === "ending"} className="btn btn-quiet">
              <Stop size={18} weight="fill" aria-hidden />
              {connection === "ending" ? "Ending" : connection === "end-failed" ? "Try ending again" : "End session"}
            </button>
          ) : (
            <button onClick={connect} disabled={connection === "connecting"} className="btn">
              <Microphone size={18} weight="fill" aria-hidden />
              {connection === "connecting" ? "Connecting" : "Connect"}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="glass shrink-0 max-w-md !rounded-2xl border-bad/40 px-4 py-2.5 text-center text-bad">
            {error}
          </p>
        )}

        <TranscriptLane
          lines={lines}
          interim={interim}
          empty={live ? "Say something. Your words appear here as you speak." : "Connect to start. Your browser will ask for the microphone."}
        />
      </div>
      <PipecatClientAudio />
    </PipecatClientProvider>
  );
}
