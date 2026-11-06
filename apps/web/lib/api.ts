export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://localhost:8100";

export type SessionStatus = "starting" | "live" | "processing" | "complete" | "failed";

export interface Summary {
  turns: number;
  responded_turns: number;
  v2v_p50: number | null;
  v2v_p95: number | null;
  v2v_max: number | null;
  stage_avg: Record<string, number | null>;
  interruptions: number;
  silence_gap_avg: number | null;
  tokens_in: number;
  tokens_out: number;
  tts_chars: number;
  duration_ms: number | null;
  cost_usd: { stt: number | null; llm: number | null; tts: number | null; total: number | null; complete: boolean } | null;
}

export interface TurnOut {
  idx: number;
  user_text: string | null;
  bot_text: string | null;
  user_start_ms: number | null;
  user_stop_ms: number | null;
  bot_start_ms: number | null;
  bot_stop_ms: number | null;
  interrupted: boolean;
  tokens_in: number | null;
  tokens_out: number | null;
  tts_chars: number | null;
  stages: Record<string, number | null>;
}

export interface SessionOut {
  id: string;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  persona_name: string;
  prompt_version: number | null;
  prompt_hash: string | null;
  stt_provider: string;
  stt_model: string | null;
  llm_provider: string;
  llm_model: string | null;
  tts_provider: string;
  tts_voice: string | null;
  error: string | null;
  created_at: string;
  summary: Summary | null;
}

export interface AudioInfo {
  url: string;
  offset_ms: number;
  duration_ms: number;
}

export interface SessionDetail extends SessionOut {
  turns: TurnOut[];
  audio: AudioInfo | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach the API. Check that it is running on port 8000.", 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()).detail;
      if (typeof body === "string") detail = body;
    } catch {}
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export interface ModelOption { id: string; label: string; in_per_m?: number | null; out_per_m?: number | null; price_per_min?: number | null; note?: string }
export interface VoiceOption { id: string; label: string; detail?: string | null; price_per_1k_chars?: number | null }
export interface ProviderOption {
  id: string;
  label: string;
  env: string;
  available: boolean;
  default_model?: string;
  default_voice?: string;
  custom_model?: boolean;
  models?: ModelOption[];
  voices?: VoiceOption[];
  price_per_1k_chars?: number | null;
  custom_voice?: boolean;
  live_voices?: string;
  note?: string;
}
export interface Providers { stt: ProviderOption[]; llm: ProviderOption[]; tts: ProviderOption[] }
export interface Persona { name: string; preview: string; hash: string }

export interface SessionConfig {
  persona: string;
  stt: { provider: string; model?: string | null };
  llm: { provider: string; model: string };
  tts: { provider: string; voice?: string | null };
}

export const createSession = (config: SessionConfig) =>
  call<{ session_id: string }>("/sessions", { method: "POST", body: JSON.stringify(config) });

export const getProviders = () => call<Providers>("/providers");
export interface VoiceList { source: "live" | "catalog"; voices: VoiceOption[]; error?: string }
export const getVoices = (provider: string) => call<VoiceList>(`/providers/tts/${provider}/voices`);
export const getPersonas = () => call<Persona[]>("/personas");

export const endSession = (id: string) => call<SessionOut>(`/sessions/${id}/end`, { method: "POST" });
export const getSession = (id: string) => call<SessionDetail>(`/sessions/${id}`);
export interface SessionFilters { persona?: string; provider?: string }
export const listSessions = (f: SessionFilters = {}) => {
  const q = new URLSearchParams();
  if (f.persona) q.set("persona", f.persona);
  if (f.provider) q.set("provider", f.provider);
  return call<SessionOut[]>(`/sessions${q.size ? `?${q}` : ""}`);
};

export interface CompareItem { session: SessionOut; v2v: number[] }
export const getCompare = (ids: string[]) => call<CompareItem[]>(`/compare?ids=${ids.join(",")}`);
