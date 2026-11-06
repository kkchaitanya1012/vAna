/** Four pipeline stages shown to people. Colors validated with the dataviz validator (dark and light). */
export type StageKey = "hearing" | "thinking" | "voicing" | "delivery";

export const STAGES: { key: StageKey; label: string; tech: string; color: string }[] = [
  { key: "hearing", label: "Hearing you", tech: "Detecting the end of your speech and transcribing it", color: "var(--stage-hear)" },
  { key: "thinking", label: "Thinking", tech: "Language model: time until its first word", color: "var(--stage-think)" },
  { key: "voicing", label: "Voicing", tech: "Text to speech: time until the first sound", color: "var(--stage-voice)" },
  { key: "delivery", label: "Delivery", tech: "Audio handed to the connection", color: "var(--stage-deliver)" },
];

export type StageValues = Record<StageKey, number | null>;

/** Collapse the API's stage metrics into the four shown stages. They sum to `v2v` when all are present. */
export function stageValues(s: Record<string, number | null>): StageValues {
  return {
    hearing: s.endpoint == null ? null : s.endpoint + (s.pre_llm ?? 0),
    thinking: s.llm_ttft ?? null,
    voicing: s.tts_ttfb ?? null,
    delivery: s.transport ?? null,
  };
}
