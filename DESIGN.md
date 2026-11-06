# vAna — Design

This document has two parts:

1. **UI design system**: how the Next.js app looks and behaves.
2. **Technical design**: contracts, data shapes, and metric definitions that the services share.

See `Plan.md` for scope, architecture overview, and build phases.

---

# Part 1 — UI Design System ("Plate Section", matte liquid glass)

Chosen in the M8 polish round: the *Plate Section* world (design-annual plates) with a *matte liquid glass* finish. Product truth is in `PRODUCT.md`.

## 1.1 Direction

Audience: a non-technical agency PM choosing a voice stack for a client. Light is the default (meeting rooms, daylight), dark follows the system.

- **Plate.** Each hero is a plate on uncoated stock: registration crosshairs at the four corners (`.marks`), hairline rules, a plate caption in 12 px ("Plate 10. Call 4cb3ca2b, default. Average time in each step.").
- **One grotesque.** Inter only. Display type is Inter at large optical size, weight 600, tracking -0.045em (`.display`) or -0.065em (`.display-xl`). Verdicts run 40 px on a phone and 88 px on desktop; the home headline reaches 128 px.
- **Matte liquid glass.** Panels and the nav are frosted (`blur(28px) saturate(175%)`), with a bright 1px rim, a soft drop and fine grain so they never look glossy. Under them, four slow blurred shapes in the four stage colours melt across the page (`.ambient`). Colour in the background is the stage colours only.
- **The vial.** The spectrum bar sits in a glass tube (`.vial`) with liquid segments per stage, 0.8 s and 1.5 s threshold lines, and widths proportional to time.
- **Verdict first.** Every analytics screen opens with a plain sentence, then the vial, then the numbers in one ruled readout. No sparklines, no card walls.
- **Colour never carries a verdict alone.** `ToneGlyph`: circle natural, triangle noticeable, square slow.

## 1.2 Tokens

Defined in `app/globals.css`. Light: stock `#ebebe8`, ink `#0d0d0f`, muted `#5b5d65`, glass fill white 78% to 50%. Dark: `#09090b`, text `#f2f1ee`, glass white 10% to 4%. Primary buttons are ink on stock. Radius: 22 px panels (`rounded-panel`), full pill for buttons, nav and vials. Stage colours (fixed, never reused): Hearing `#2a78d6 / #3987e5`, Thinking `#eb6834 / #d95926`, Voicing `#1baf7a / #199e70`, Delivery `#6250d6 / #9085e9`. Latency: under 800 ms natural, 800 to 1500 ms noticeable, over 1500 ms slow.

## 1.3 Layout and responsive

- Desktop: a floating glass nav pill (mark, wordmark, three links, current page filled), content max 1152 px.
- Phone: wordmark pill on top, a floating bottom tab bar. The tab bar is hidden on the live call, where the End session button owns the bottom edge.
- Sessions: table from 640 px, cards below. Home: the three pipeline steps side by side from 1024 px.
- Motion: one entrance, `.rise` (translate 14 px, blur 6 px, strong ease-out, 70 ms stagger) on the home and session heroes. The home orb floats slowly. Reduced motion stops all of it.

## 1.4 Live call

The orb is a glass lens inside a thin conic ring. Idle: grey ring. You speak: ink ring pulses with mic level. Thinking: the four-colour ring spins. Agent speaks: the spectrum ring turns and blooms with level; speech bars use the stage colours. Transcript lane: newest line sharp, older lines fade and blur. The controls are in normal flow below the lane, never sticky over it.

## 1.5 Accessibility

WCAG 2.1 AA text contrast on glass (glass fill is at least 50% white in light). Every stage mark has a label. Charts keep their data-table fallback. `prefers-reduced-motion` and `prefers-reduced-transparency` (glass becomes a solid panel) are honoured.

---

# Part 2 — Technical Design

## 2.1 Services and ports (local)

| Service | Tech | Port |
|---|---|---|
| `web` | Next.js | 3000 |
| `api` | FastAPI | 8000 |
| `voice` | Pipecat + FastAPI control endpoint | 8100 |
| `postgres` | Postgres 16 | 5432 |
| `minio` | S3-compatible storage | 9000 / 9001 |
| `langfuse` | Langfuse v3 (with its own Postgres, ClickHouse, Redis) | 3001 |

## 2.2 Session lifecycle

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant D as Daily
  participant V as Voice
  participant L as Langfuse
  participant DB as Postgres
  participant S as MinIO

  W->>A: POST /sessions {persona, stt, llm, tts}
  A->>DB: insert session (status=starting)
  A->>D: create room + tokens
  A->>V: POST /start {session_id, room_url, bot_token, config}
  V->>L: get_prompt(persona, label=production)
  V-->>A: 202 {prompt_version}
  A->>DB: update session (status=live, prompt_version)
  A-->>W: {session_id, room_url, user_token}
  W->>D: join room (WebRTC)
  V->>D: join room (WebRTC)
  loop each turn
    V->>A: POST /sessions/{id}/events (batched)
    V->>L: OTel spans
  end
  W->>A: POST /sessions/{id}/end
  A->>V: POST /stop {session_id}
  V->>S: upload session.wav
  V->>A: POST /sessions/{id}/events [session_closed {audio_key}]
  A->>DB: derive turns + summary (status=complete)
  W->>A: GET /sessions/{id}
```

Session status values: `starting`, `live`, `processing`, `complete`, `failed`.

Failure rules:
- Bot fails to start: session becomes `failed`, Web shows error with reason.
- Participant leaves without `/end`: Voice detects `on_participant_left` and runs the same stop path.
- Event POST fails: Voice retries with backoff and keeps an in-memory buffer; final flush on stop.

## 2.3 API contracts

All JSON. IDs are UUIDv7 (time-ordered).

```http
POST /sessions
{ "persona": "support-agent",
  "stt": { "provider": "deepgram", "model": "nova-3" },
  "llm": { "provider": "anthropic", "model": "claude-haiku-5-5" },
  "tts": { "provider": "cartesia", "voice": "<voice-id>" } }
-> 201 { "session_id": "...", "room_url": "...", "token": "..." }

POST /sessions/{id}/end            -> 202
POST /sessions/{id}/events         body: { "events": [Event, ...] } -> 204
GET  /sessions?persona=&provider=&limit=&cursor=
GET  /sessions/{id}                -> Session + turns[] + summary + audio_url (presigned)
GET  /compare?ids=a,b,c            -> per-session summary + stage averages + per-turn V2V
GET  /personas                     -> [{ name, versions, production_version }]
GET  /providers                    -> { stt: [...], llm: [...], tts: [...] } with models/voices
```

Voice control endpoint (internal only):

```http
POST /start { session_id, room_url, token, config } -> 202 { prompt_version }
POST /stop  { session_id }                          -> 202
```

## 2.4 Event format

The voice server emits one flat event stream. The API derives turns from it. Raw events are kept for debugging and future metrics.

```json
{
  "session_id": "0192...",
  "seq": 42,
  "type": "llm_first_token",
  "t_ms": 18234.6,
  "turn_idx": 3,
  "payload": {}
}
```

- `t_ms`: milliseconds since session start, from the voice server's monotonic clock. One clock for all events, so no cross-machine skew.
- `session_started` carries the wall-clock epoch for `t_ms = 0`.
- `seq` is strictly increasing; the API ignores duplicates.

Event types:

| Type | Source frame | Payload |
|---|---|---|
| `session_started` | pipeline start | `{ epoch_ms, config, prompt_version }` |
| `user_started_speaking` | `UserStartedSpeakingFrame` | — |
| `user_stopped_speaking` | `UserStoppedSpeakingFrame` (VAD) | — |
| `turn_end_detected` | turn analyzer decision | `{ analyzer, confidence }` |
| `stt_final` | final `TranscriptionFrame` | `{ text }` |
| `llm_started` | `LLMFullResponseStartFrame` | — |
| `llm_first_token` | first `LLMTextFrame` in response | — |
| `llm_completed` | `LLMFullResponseEndFrame` | `{ text, tokens_in, tokens_out }` |
| `tts_first_byte` | first `TTSAudioRawFrame` | — |
| `bot_started_speaking` | `BotStartedSpeakingFrame` | — |
| `bot_stopped_speaking` | `BotStoppedSpeakingFrame` | `{ tts_chars }` |
| `interruption` | interruption frame | `{ during: "llm" or "tts" or "playout" }` |
| `metrics` | `MetricsFrame` | Pipecat metric data (TTFB, processing, usage) |
| `error` | `ErrorFrame` | `{ stage, message }` |
| `session_closed` | stop path | `{ audio_key, duration_ms }` |

## 2.5 Database schema

```sql
CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  status          text NOT NULL,
  started_at      timestamptz,
  ended_at        timestamptz,
  persona_name    text NOT NULL,
  prompt_version  int,
  stt_provider    text NOT NULL, stt_model text,
  llm_provider    text NOT NULL, llm_model text,
  tts_provider    text NOT NULL, tts_voice text,
  audio_key       text,
  summary         jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE turns (
  id                 uuid PRIMARY KEY,
  session_id         uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx                int  NOT NULL,
  user_text          text,
  bot_text           text,
  user_start_ms      double precision,
  user_stop_ms       double precision,
  turn_end_ms        double precision,
  stt_final_ms       double precision,
  llm_started_ms     double precision,
  llm_first_token_ms double precision,
  tts_first_byte_ms  double precision,
  bot_start_ms       double precision,
  bot_stop_ms        double precision,
  interrupted        boolean NOT NULL DEFAULT false,
  tokens_in          int,
  tokens_out         int,
  tts_chars          int,
  langfuse_trace_id  text,
  UNIQUE (session_id, idx)
);

CREATE TABLE events (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        int  NOT NULL,
  type       text NOT NULL,
  t_ms       double precision NOT NULL,
  turn_idx   int,
  payload    jsonb,
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX ON sessions (created_at DESC);
CREATE INDEX ON sessions (persona_name, llm_provider);
```

Managed with Alembic in `services/api/migrations`.

## 2.6 Metric definitions

All values in milliseconds per turn. A stage is `null` when its events are missing (for example the turn was interrupted before TTS).

| Metric | Formula |
|---|---|
| Turn detection wait | `turn_end_ms - user_stop_ms` |
| STT latency | `stt_final_ms - user_stop_ms` (overlaps turn detection; shown separately, not stacked) |
| LLM TTFT | `llm_first_token_ms - llm_started_ms` |
| Pre-LLM gap | `llm_started_ms - max(turn_end_ms, stt_final_ms)` |
| TTS TTFB | `tts_first_byte_ms - llm_first_token_ms` |
| Transport / playout | `bot_start_ms - tts_first_byte_ms` |
| **Voice-to-voice (V2V)** | `bot_start_ms - user_stop_ms` |
| Bot speech duration | `bot_stop_ms - bot_start_ms` |
| Silence gap | gap between `bot_stop_ms` of turn n and `user_start_ms` of turn n+1 |

M3 implementation notes:
- `user_stop` is the real end of speech: the VAD stop event time minus the VAD `stop_secs` (the silence it needed to confirm). The raw `user_started_speaking` and `user_stopped_speaking` events carry `start_secs` and `stop_secs` for that reason.
- `endpoint` = `user_stop` to the later of turn-end and final transcript, capped at LLM start. It replaces separate "turn detection" and "STT" bars in the stack, since they overlap. Both are still reported individually.
- The bot's first turn (greeting) has no user timings, so it has no V2V.
- `transport` is measured at the voice server's output (first audio written), so it is about 0 ms. True network and playout delay to the browser needs client-side measurement (later phase).
- Turns are rebuilt from stored events on session close and on end, idempotently. Delivery order does not matter.

Waterfall stacking (sums exactly to V2V):
`[user_stop → max(turn_end, stt_final)]` as turn detection + STT, then pre-LLM gap, LLM TTFT, TTS TTFB, transport.

Session summary (`sessions.summary`):

```json
{
  "turns": 8,
  "v2v_p50": 742, "v2v_p95": 1310, "v2v_max": 1520,
  "stage_avg": { "turn": 210, "llm_ttft": 320, "tts_ttfb": 140, "net": 60 },
  "interruptions": 2,
  "silence_gap_avg": 1800,
  "tokens_in": 4120, "tokens_out": 610, "tts_chars": 2300,
  "stt_seconds": 96.4,
  "cost_usd": { "stt": 0.006, "llm": 0.004, "tts": 0.07, "total": 0.08 }
}
```

Percentiles use linear interpolation and skip turns with null V2V.

Note: these are server-side measurements. They exclude browser mic capture and network transit to the user. Client-side measurement is a later phase (see `Plan.md`).

## 2.7 Provider registry

`services/voice/providers.py` maps config keys to Pipecat service factories:

```python
STT = {"deepgram": make_deepgram_stt, "assemblyai": make_assemblyai_stt}
LLM = {"anthropic": make_anthropic_llm, "openai": make_openai_llm}
TTS = {"cartesia": make_cartesia_tts, "elevenlabs": make_elevenlabs_tts}
```

- Each factory takes the stage config dict and reads its key from env.
- The API `GET /providers` reads the same catalog (shared `providers.yaml`) so UI options match what the bot supports.
- Unknown provider or missing key: `/start` returns 400 with a clear message.

Pricing lives in `services/api/pricing.yaml`, keyed by provider and model, with a `last_checked` date. Costs are estimates.

## 2.8 Langfuse integration

- **Prompts**: one prompt per persona, type `text`, label `production` used by default. Variables: `{{user_name}}`, `{{date}}`.
- **Tracing**: Pipecat OTel tracing to Langfuse OTLP endpoint. One trace per session, one span per turn, child spans per service. Span attribute `vana.session_id` and `vana.turn_idx` link back to Postgres.
- Trace ID per turn is stored in `turns.langfuse_trace_id` for deep links.

## 2.9 Storage

- Bucket `vana-audio`, key `sessions/{session_id}/session.wav` (16 kHz, stereo: left user, right bot).
- API returns presigned GET URL, 1 hour expiry.

## 2.10 Configuration

`.env` at repo root, loaded by Compose:

```
DAILY_API_KEY=
DEEPGRAM_API_KEY=
ASSEMBLYAI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
CARTESIA_API_KEY=
ELEVENLABS_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=http://langfuse:3000
DATABASE_URL=postgresql+asyncpg://vana:vana@postgres:5432/vana
S3_ENDPOINT=http://minio:9000
S3_BUCKET=vana-audio
VOICE_URL=http://voice:8100
```

Never commit `.env`. Commit `.env.example` only.

## 2.11 Testing

- `services/api`: pytest for metric derivation using fixture event streams (normal turn, interruption, missing TTS, out-of-order delivery, duplicate `seq`).
- `services/voice`: unit test for the observer using Pipecat test utilities with synthetic frames.
- `apps/web`: component tests for LatencyWaterfall math (segments sum to V2V) and Playwright smoke test for session list and analytics pages with seeded data.
