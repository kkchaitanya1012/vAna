"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SelectField } from "@/components/select-field";
import { VoicePicker } from "@/components/voice-picker";
import { createSession, type Persona, type ProviderOption, type Providers } from "@/lib/api";

const CUSTOM = "__custom__";

const firstAvailable = (list: ProviderOption[]) => list.find((p) => p.available) ?? list[0];
const label = (p: ProviderOption) => (p.available ? p.label : `${p.label} (needs ${p.env})`);

function usd(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return `$${Math.abs(r * 100 - Math.round(r * 100)) < 1e-9 ? r.toFixed(2) : r.toFixed(3)}`;
}

function priceText(m?: { in_per_m?: number | null; out_per_m?: number | null; price_per_min?: number | null; note?: string }) {
  if (!m) return "No price estimate for this model.";
  const parts: string[] = [];
  if (m.in_per_m != null && m.out_per_m != null) parts.push(`${usd(m.in_per_m)} in, ${usd(m.out_per_m)} out per million tokens`);
  else if (m.price_per_min != null) parts.push(`about ${usd(m.price_per_min)} per minute`);
  else parts.push("No price estimate for this model");
  if (m.note) parts.push(m.note);
  return parts.join(". ");
}

export function NewSessionForm({ providers, personas }: { providers: Providers; personas: Persona[] }) {
  const router = useRouter();
  const [persona, setPersona] = useState(personas.find((p) => p.name === "default")?.name ?? personas[0]?.name ?? "default");

  const stt0 = firstAvailable(providers.stt);
  const llm0 = firstAvailable(providers.llm);
  const tts0 = firstAvailable(providers.tts);
  const [sttP, setSttP] = useState(stt0.id);
  const [sttM, setSttM] = useState(stt0.default_model ?? "");
  const [llmP, setLlmP] = useState(llm0.id);
  const [llmM, setLlmM] = useState(llm0.default_model ?? "");
  const [llmCustom, setLlmCustom] = useState("");
  const [ttsP, setTtsP] = useState(tts0.id);
  const [ttsV, setTtsV] = useState(tts0.default_voice ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stt = providers.stt.find((p) => p.id === sttP)!;
  const llm = providers.llm.find((p) => p.id === llmP)!;
  const tts = providers.tts.find((p) => p.id === ttsP)!;
  const personaInfo = personas.find((p) => p.name === persona);
  const unavailable = [stt, llm, tts].filter((p) => !p.available);
  const llmModel = llmM === CUSTOM ? llmCustom.trim() : llmM;
  const stack = `${stt.label} · ${llm.models?.find((m) => m.id === llmModel)?.label ?? llmModel} · ${tts.label}`;

  function pick(list: ProviderOption[], id: string, set: (m: string) => void, field: "default_model" | "default_voice") {
    set(list.find((p) => p.id === id)?.[field] ?? "");
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (unavailable.length) return;
    if (!llmModel) return setError("Enter a model id.");
    if (ttsV === "__custom__") return setError("Enter a voice id.");
    setBusy(true);
    setError(null);
    try {
      const { session_id } = await createSession({
        persona,
        stt: { provider: sttP, model: sttM || null },
        llm: { provider: llmP, model: llmModel },
        tts: { provider: ttsP, voice: ttsV || null },
      });
      router.push(`/live/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the session.");
      setBusy(false);
    }
  }

  const sel = "text-[13px]";
  return (
    <form onSubmit={start} className="space-y-4">
      <div className="panel marks rounded-panel p-5 sm:p-7">
        <div className="max-w-md">
          <SelectField
            id="persona" label="Who is the agent?" value={persona} onChange={setPersona}
            hint={personaInfo ? <>{personaInfo.preview} <span className="mono">{personaInfo.hash}</span></> : "The system prompt the agent follows."}
          >
            {personas.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </SelectField>
        </div>

        <ol className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-0">
          <Stage n="Hearing you" color="var(--stage-hear)" sub="Speech to text" last={false}>
            <SelectField id="stt-p" label="Provider" value={sttP}
              onChange={(v) => { setSttP(v); pick(providers.stt, v, setSttM, "default_model"); }}>
              {providers.stt.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </SelectField>
            <SelectField id="stt-m" label="Model" value={sttM} onChange={setSttM}>
              {stt.models?.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </SelectField>
            <p className="text-xs text-muted">{priceText(stt.models?.find((m) => m.id === sttM))}{stt.note ? `. ${stt.note}` : ""}</p>
          </Stage>

          <Stage n="Thinking" color="var(--stage-think)" sub="Language model" last={false}>
            <SelectField id="llm-p" label="Provider" value={llmP}
              onChange={(v) => { setLlmP(v); pick(providers.llm, v, setLlmM, "default_model"); }}>
              {providers.llm.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </SelectField>
            <SelectField id="llm-m" label="Model" value={llmM} onChange={setLlmM}>
              {llm.models?.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              {llm.custom_model && <option value={CUSTOM}>Other model id...</option>}
            </SelectField>
            {llmM === CUSTOM ? (
              <div>
                <label htmlFor="llm-custom" className="label">Model id</label>
                <input id="llm-custom" value={llmCustom} onChange={(e) => setLlmCustom(e.target.value)}
                       placeholder="vendor/model-name" className={`field mono mt-2 ${sel}`} />
                <p className="mt-1.5 text-xs text-muted">Any model on openrouter.ai. No price estimate for models outside the list.</p>
              </div>
            ) : (
              <p className="text-xs text-muted">{priceText(llm.models?.find((m) => m.id === llmM))}</p>
            )}
          </Stage>

          <Stage n="Voicing" color="var(--stage-voice)" sub="Text to speech" last>
            <SelectField id="tts-p" label="Provider" value={ttsP}
              onChange={(v) => { setTtsP(v); pick(providers.tts, v, setTtsV, "default_voice"); }}>
              {providers.tts.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </SelectField>
            <VoicePicker key={tts.id} provider={tts} value={ttsV} onChange={setTtsV} usd={usd} />
          </Stage>
        </ol>
      </div>

      {unavailable.length > 0 && (
        <p role="alert" className="rounded-panel border border-warn/40 bg-warn/10 px-4 py-3 text-warn">
          Add {unavailable.map((p) => p.env).join(", ")} to .env to use {unavailable.map((p) => p.label).join(", ")}.
        </p>
      )}
      {error && <p role="alert" className="rounded-panel border border-bad/40 bg-bad/10 px-4 py-3 text-bad">{error}</p>}

      <div className="flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate text-[13px] text-muted" title={stack}>{stack}</p>
        <button type="submit" disabled={busy || unavailable.length > 0} className="btn shrink-0">
          {busy ? "Starting" : "Start the call"}
        </button>
      </div>
    </form>
  );
}

/** One step of the chain. The colored rule on top is the stage's color everywhere in the app. */
function Stage({ n, sub, color, children, last }: { n: string; sub: string; color: string; children: React.ReactNode; last: boolean }) {
  return (
    <li className={`relative space-y-4 lg:px-6 lg:first:pl-0 lg:last:pr-0 ${last ? "" : "lg:border-r lg:border-line"}`}>
      <div>
        <span aria-hidden className="block h-[3px] w-10 rounded-full" style={{ background: color, boxShadow: `0 0 14px 0 color-mix(in srgb, ${color} 60%, transparent)` }} />
        <h2 className="display mt-3 text-[24px] leading-7">{n}</h2>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      {children}
    </li>
  );
}
