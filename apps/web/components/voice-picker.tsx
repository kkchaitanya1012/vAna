"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/select-field";
import { getVoices, type ProviderOption, type VoiceOption } from "@/lib/api";

const CUSTOM = "__custom__";
const SHOWN = 150;

/** Voice list for one provider. Mount with `key={provider.id}` so each provider starts fresh. */
export function VoicePicker({
  provider, value, onChange, usd,
}: {
  provider: ProviderOption;
  value: string;
  onChange: (id: string) => void;
  usd: (n: number) => string;
}) {
  const [voices, setVoices] = useState<VoiceOption[]>(provider.voices ?? []);
  const [state, setState] = useState<"loading" | "live" | "static">(provider.live_voices && provider.available ? "loading" : "static");
  const [warning, setWarning] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!(provider.live_voices && provider.available)) return;
    let stale = false;
    getVoices(provider.id)
      .then((r) => {
        if (stale) return;
        // The catalog default may not be in the vendor's list; keep it selectable.
        setVoices(r.voices.some((v) => v.id === value) ? r.voices : [provider.voices?.find((v) => v.id === value) ?? { id: value, label: "Default voice" }, ...r.voices]);
        setState(r.source === "live" ? "live" : "static");
        setWarning(r.error ?? null);
      })
      .catch(() => {
        if (stale) return;
        setState("static");
        setWarning("Could not load the full voice list. Showing a short list.");
      });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `value` is the default at mount; the picker is re-keyed per provider
  }, [provider.id, provider.live_voices, provider.available]);

  const isCustom = value === CUSTOM || (!voices.some((v) => v.id === value) && value !== "");
  const q = filter.trim().toLowerCase();
  const matches = q ? voices.filter((v) => `${v.label} ${v.detail ?? ""} ${v.id}`.toLowerCase().includes(q)) : voices;
  const shown = matches.slice(0, SHOWN);
  const selected = voices.find((v) => v.id === value);
  const price = selected?.price_per_1k_chars ?? provider.price_per_1k_chars ?? null;
  // Keep the chosen voice in the list even when the filter hides it.
  const options = selected && !shown.includes(selected) ? [selected, ...shown] : shown;

  return (
    <div className="space-y-3">
      {voices.length > 12 && (
        <div>
          <label htmlFor="tts-filter" className="label">Find a voice</label>
          <input id="tts-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                 placeholder="Name, language, accent" className="field mt-2 text-[13px]" />
        </div>
      )}
      <SelectField
        id="tts-v" label={`Voice${state === "loading" ? " (loading...)" : ` (${voices.length}${matches.length !== voices.length ? `, ${matches.length} match` : ""})`}`}
        value={isCustom ? CUSTOM : value}
        onChange={(v) => { if (v === CUSTOM) { onChange(custom || CUSTOM); } else { onChange(v); } }}
      >
        {options.map((v) => <option key={v.id} value={v.id}>{v.label}{v.detail ? ` · ${v.detail}` : ""}</option>)}
        {provider.custom_voice && <option value={CUSTOM}>Other voice id...</option>}
      </SelectField>
      {matches.length > options.length && (
        <p className="text-xs text-muted">Showing {options.length} of {matches.length}. Type in the box to narrow the list.</p>
      )}
      {isCustom && provider.custom_voice && (
        <div>
          <label htmlFor="tts-custom" className="label">Voice id</label>
          <input id="tts-custom" value={custom} onChange={(e) => { setCustom(e.target.value); onChange(e.target.value.trim() || CUSTOM); }}
                 placeholder="Paste the voice id from the provider" className="field mono mt-2 text-[13px]" />
        </div>
      )}
      <p className="text-xs text-muted">
        {price != null ? `About ${usd(price)} per 1,000 characters spoken. ` : "No price estimate for this voice. "}
        {warning ?? provider.note}
      </p>
    </div>
  );
}
