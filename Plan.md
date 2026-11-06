# vAna — Voice Session Analytics: Architecture Plan

## Context
Portfolio + learning project. User starts a voice session in the browser, talks with an AI voice agent, ends the session, then opens an analytics view showing where latency went, turn by turn. Repo `vAna/` is empty (greenfield).

Decisions made with user:
- Cascaded pipeline (STT -> LLM -> TTS) so each stage is measurable.
- Pipecat (Python) voice server, Daily WebRTC transport.
- FastAPI backend, Next.js frontend.
- Pluggable providers per session (compare stacks).
- Langfuse = persona prompts + LLM traces. Own Postgres = sessions, turns, stage timings.
- Docker Compose local first, cloud deploy later.
- No auth (single user).
- Analytics: per-turn waterfall, audio replay + transcript, summary metrics, cross-session comparison.

## Architecture

```
Browser (Next.js)
  |  POST /sessions {persona, stt, llm, tts}
  v
API (FastAPI) ---- Postgres (sessions, turns, events)
  |  create Daily room + token, spawn bot
  v
Voice server (Pipecat) <== WebRTC (Daily) ==> Browser mic/speaker
  | fetch persona prompt          | OTel spans
  v                               v
Langfuse (prompts)            Langfuse (traces)
  | per-turn timing events -> API -> Postgres
  | session WAV -> MinIO (S3)
```

## Repo layout
```
vAna/
  apps/web/            Next.js (App Router) + Tailwind + @pipecat-ai/client-react
  services/api/        FastAPI, SQLAlchemy + Alembic
  services/voice/      Pipecat bot, provider registry, metrics observer
  infra/docker-compose.yml   postgres, minio, langfuse (+ its postgres/clickhouse/redis), api, voice, web
  .env.example         DAILY_API_KEY, DEEPGRAM_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, CARTESIA_API_KEY, ELEVENLABS_API_KEY, LANGFUSE_*
```

## Components

### 1. Voice server (`services/voice`)
- Pipeline: `DailyTransport.input -> Silero VAD + smart-turn -> STT -> user context aggregator -> LLM -> TTS -> DailyTransport.output -> assistant aggregator`.
- `PipelineParams(enable_metrics=True, enable_usage_metrics=True)` plus Pipecat OTel tracing exported to Langfuse OTLP endpoint.
- **Provider registry** (`providers.py`): dict factory per stage. Start with STT {deepgram, assemblyai}, LLM {anthropic, openai}, TTS {cartesia, elevenlabs}. Session config picks keys.
- **Persona**: at bot start, `langfuse.get_prompt(name, label="production")` -> system prompt. Store prompt name + version on session row.
- **SessionMetricsObserver** (custom Pipecat `BaseObserver`): timestamps per turn using monotonic clock:
  - `UserStartedSpeakingFrame`, `UserStoppedSpeakingFrame`
  - final `TranscriptionFrame` (STT final)
  - `LLMFullResponseStartFrame`, first `LLMTextFrame` (LLM TTFT)
  - first `TTSAudioRawFrame` (TTS TTFB)
  - `BotStartedSpeakingFrame`, `BotStoppedSpeakingFrame`
  - interruption frames (barge-in)
  - `MetricsFrame` data: TTFB, processing time, LLM tokens, TTS chars
  - Batches events, POSTs to `API /sessions/{id}/events`.
- **Recording**: `AudioBufferProcessor` -> WAV on session end -> MinIO; transcript from aggregators.
- Exposes `POST /start {session_id, room_url, token, config}`; runs bot as asyncio task.

### 2. API (`services/api`)
- `POST /sessions` create row, Daily room + token (Daily REST), call voice `/start`, return room URL + token.
- `POST /sessions/{id}/end`, `POST /sessions/{id}/events` (ingest), `GET /sessions`, `GET /sessions/{id}` (turns, summary, signed audio URL), `GET /compare?ids=`, `GET /personas` (proxy Langfuse prompt list), `GET /providers`.
- On session end: compute derived turn metrics + session summary (p50/p95 voice-to-voice, avg stage times, interruptions, silence gaps, tokens, cost via price table `pricing.py`).

### 3. Data model (Postgres)
- `sessions`: id, status, started_at, ended_at, persona_name, prompt_version, stt/llm/tts provider + model, audio_key, summary jsonb.
- `turns`: id, session_id, idx, user_text, bot_text, ts columns (user_start, user_stop, stt_final, llm_first_token, tts_first_byte, bot_start, bot_stop), interrupted, tokens_in, tokens_out, tts_chars, langfuse_trace_id.
- `events`: id, session_id, turn_id, type, ts, payload jsonb (raw stream, for debugging + future metrics).
- Key derived metric: **voice-to-voice latency = bot_start - user_stop**, split into turn-detection wait, STT, LLM TTFT, TTS TTFB, transport.

### 4. Frontend (`apps/web`)
- `/` new session: pick persona (from Langfuse), STT/LLM/TTS providers, start.
- `/live/[id]`: Pipecat client + WebRTC transport, immersive stage: voice orb, speaking indicators, live transcript lane, end button (see `DESIGN.md` 1.9).
- `/sessions`: list with key metrics.
- `/sessions/[id]`: summary cards, per-turn latency waterfall (stacked horizontal bars per stage), audio replay (wavesurfer.js) with turn markers synced to transcript, link to Langfuse trace.
- `/compare`: pick sessions, compare p50/p95 and stage breakdown grouped by provider/persona.
- Charts: Recharts or visx.
- Font: Inter. Look: posh, slightly blurry, frosted glass over an ambient blurred background. It must read as a developer observability platform that a product manager can also use.
- Live session UI: voice orbs; voice icons while the user speaks; speech animations while the bot speaks; a transcript lane below showing what is coming; blurred background.
- Analytics UI: Mixpanel-style boards (big-number cards with deltas and sparklines, smooth insight charts, breakdown and filter bar). Details in `DESIGN.md` 1.10.
- UI quality is at least 20% of the project's value. Polish counts as a deliverable in every milestone that ships UI.

### 5. Persona editing
Default: edit `services/voice/personas/*.md`. Optional: when Langfuse keys are set, edit prompts in Langfuse UI (versions + labels free). App lists prompts and records version used, so comparison can group by prompt version. In-app editor later, optional.

## Build phases
Milestones, estimates and exit checks live in `ROADMAP.md`. Phases below map to M1-M8.
1. **Skeleton**: Compose with Postgres, MinIO, Langfuse. Pipecat bot with one fixed stack (Deepgram + Anthropic + Cartesia), test via Pipecat dev runner.
2. **Session flow**: API creates Daily room, spawns bot; Next.js live page connects; end session works.
3. **Instrumentation**: observer, event ingest, turns table, OTel to Langfuse.
4. **Analytics UI**: summary + waterfall + transcript.
5. **Recording + replay**: MinIO upload, wavesurfer with markers.
6. **Pluggable providers + Langfuse personas**: registry, selector UI.
7. **Comparison page + cost**.
8. Later: client-side latency (Daily network stats, browser mic-to-speaker), cloud deploy (Vercel web, Fly.io voice + API, Langfuse Cloud), README with architecture diagram + demo video.

## Verification
- `docker compose up` brings all services healthy; Langfuse UI reachable.
- Run a 5-turn session in browser; check `turns` table has 5 rows with all timestamps monotonic (user_stop < stt_final < llm_first_token < tts_first_byte < bot_start).
- Langfuse shows trace per turn with prompt version linked.
- Analytics page waterfall sums match voice-to-voice latency within ~10 ms.
- Audio replay markers line up with heard turns.
- Run same script with two provider stacks; compare page shows difference.
- Unit tests: metric derivation (`services/api` pytest) with fixture event streams, incl. interruption + missing-stage cases.


