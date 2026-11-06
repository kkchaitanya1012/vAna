# vAna Roadmap

Milestones turn the build phases in `Plan.md` into shippable steps. Each milestone has a goal, deliverables, an exit check, and the skills to use. Estimates assume part-time work (about 10 hours a week) and are guesses; adjust after M1.

| # | Milestone | Estimate | Result you can show |
|---|---|---|---|
| M0 | Setup | 2 days | Repo, tooling, skills ready |
| M1 | Talking bot | 1 week | Speak to a bot from a terminal |
| M2 | Browser session | 1 week | Start and end a session from the web app |
| M3 | Capture timings | 1 week | Every turn's timestamps stored in Postgres |
| M4 | Analytics UI | 1.5 weeks | Per-turn latency waterfall and summary |
| M5 | Recording and replay | 1 week | Audio replay synced to transcript |
| M6 | Providers and personas | 1 week | Switch stacks and prompts per session |
| M7 | Compare and cost | 1 week | Side-by-side session comparison |
| M8 | Polish and ship | 1.5 weeks | Public demo, README, video |

Total: about 9 to 10 weeks. M1 to M4 is the minimum useful product (about 4.5 weeks).

---

## Decisions log
- **LLM via OpenRouter** (not Anthropic direct). Groq key also available for comparison stacks in M6.
- **Langfuse is optional.** Personas load from `services/voice/personas/*.md` unless Langfuse keys are set.
- **M2 transport is SmallWebRTC**, not Daily (no account needed, runs local). Daily can return as a second transport. The API returns `offer_url` instead of `room_url` and `token`.
- **Model benchmarking is deferred** until after M6/M7 (provider and model comparison). Known so far: OpenRouter default routing sent some turns to slow hosts (LLM TTFB 1.5 to 5.3 s); pinning a fast host or `sort: latency` is the first thing to test.
- **Providers (M6):** one catalog, `config/providers.yaml`, read by the API and the voice server. Keys decide what is selectable. AssemblyAI, ElevenLabs and OpenAI are wired and construct correctly, but they are untested with real calls (no keys yet). Prices are estimates; an unknown price is left out of the cost total, never guessed.
- **Audio storage is local disk for now** (no Docker). Swap to S3 or MinIO in `services/api/app/storage.py` when Docker is available.
- **Compare (M7):** `GET /compare?ids=` takes 2 to 4 sessions and returns each summary plus per-turn voice-to-voice times. `GET /sessions` filters by `persona` and `provider` (matches speech to text, language model or voice). The page picks the lowest value per row as best; ties all win; "best" is shown with a label, not color alone. Fewer than 5 turns shows a caution.
- **More STT and voices (before M8):** the registry is data-driven (`service:` class path per catalog entry). 9 STT and 8 voice providers. Cartesia and ElevenLabs voice libraries load live from the vendor. Real-call tested: Groq Whisper, Cartesia Ink. Others construct but are untested (no keys).
- **Visual direction (M8 polish):** two rounds of direction exploration (other worlds were rejected). Chosen: Plate Section with a matte liquid glass finish. Inter stays the only face. Light default, dark supported.
- **Open-source release** after M8. Extras for a hosted demo (such as visitor sign-in) are optional extensions and are not part of this repository.
- **UI direction (after M2 review):** the first UI looked like Streamlit and was rejected. New direction: Inter, frosted glass over an ambient blurred background, voice orb with speaking indicators and a transcript lane on the live page, Mixpanel-style analytics. See `DESIGN.md` 1.9 and 1.10.

## M0 — Setup
**Goal:** a clean base so later milestones don't stall on tooling.

- Create accounts and keys: Daily, Deepgram, Anthropic, Cartesia, Langfuse (local). Add OpenAI, ElevenLabs and AssemblyAI later in M6.
- Repo scaffold: `apps/web`, `services/api`, `services/voice`, `infra/`, `.env.example`, `.gitignore`.
- `git init`, first commit.
- Docker Compose with Postgres, MinIO and Langfuse running healthy.

**Exit check:** `docker compose up` starts all three services and the Langfuse UI opens.

## M1 — Talking bot
**Goal:** prove the voice loop works before building anything around it.

- Pipecat bot with Deepgram, Claude and Cartesia.
- Run through the Pipecat dev runner and hold a real conversation.
- Persona loaded from `services/voice/personas/<name>.md` by default. Langfuse is optional: when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set, the `production` prompt is used instead.
- Pipecat metrics enabled; log TTFB values to the console.

**Exit check:** a 2-minute conversation works, interruptions behave, and per-stage TTFB prints for each turn.
**Risk:** WebRTC and audio device problems. Test on headphones to avoid echo.

## M2 — Browser session
**Goal:** the full start-to-end flow through the web app.

- FastAPI: `POST /sessions`, `POST /sessions/{id}/end`, Daily room and token creation, voice server `/start` and `/stop`.
- Postgres `sessions` table and the first Alembic migration.
- Next.js: new-session page and live page with the Pipecat client.
- Handle failure paths: bot fails to start, user closes the tab.

**Exit check:** start a session in the browser, talk, end it, and see a `complete` row in `sessions`.

## M3 — Capture timings
**Goal:** trustworthy timing data. Everything after this depends on it.

- `SessionMetricsObserver` emitting the events listed in `DESIGN.md` 2.4.
- Batched event ingest endpoint with retry and duplicate protection.
- `turns` and `events` tables; derive turns on session end.
- OTel traces to Langfuse are deferred: Langfuse is optional, and the Postgres/SQLite `turns` data already answers the latency questions. Add when Langfuse is switched on.
- Pytest fixtures for normal, interrupted, missing-stage and out-of-order streams.

**Exit check:** a 5-turn session gives 5 `turns` rows with increasing timestamps, and the unit tests pass.
**Risk:** frame ordering in Pipecat differs from expectations. Log raw frames early.

## M4 — Analytics UI
**Goal:** the core of the project: see where latency went.

- `/sessions` list and `/sessions/[id]` analytics page.
- Summary cards (p50, p95, turns, interruptions, tokens).
- LatencyWaterfall, stage breakdown, transcript list with synced selection.
- Design tokens from `DESIGN.md` Part 1, dark and light themes.
- Mixpanel-style board: big-number cards with deltas, insight charts, breakdown and filter bar (`DESIGN.md` 1.10).

**Exit check:** waterfall segments add up to voice-to-voice latency within 10 ms for every turn of a real session.

## M5 — Recording and replay
**Goal:** hear what the numbers describe.

- `AudioBufferProcessor` to a 16 kHz stereo WAV (you left, agent right), uploaded to the API on stop. Storage is local disk (`data/audio/`) behind `app/storage.py` until Docker is available; S3 or MinIO with presigned URLs slots in there later.
- The API serves the file with Range support, so seeking works. The recording's time zero is saved as a `recording_started` event, so audio time and event time line up.
- wavesurfer.js replay, SessionTimeline, turn markers, click-to-seek from the waterfall.
- Keyboard shortcuts (`space`, `j`, `k`).

**Exit check:** clicking a turn plays that exact moment, and markers line up with what you hear.

## M6 — Providers and personas
**Goal:** run experiments by changing the stack or the prompt.

- Provider registry with `providers.yaml`: add AssemblyAI, OpenAI and ElevenLabs.
- `GET /providers` and `GET /personas`; selector UI.
- Record prompt name and version on each session.
- Pricing table and per-session cost estimate.

**Exit check:** two sessions with different stacks run end to end, and each stores its own provider and prompt version.

## M7 — Compare and cost
**Goal:** answer "which stack is faster, and what does it cost?"

- `/compare` page: stage averages per session, V2V distribution, summary table with best values marked.
- Filters on the session list by persona and provider.
- Tests for the comparison endpoint.

**Exit check:** compare two stacks over at least 5 turns each and read the winner off the page.

## M8 — Polish and ship
**Goal:** something a stranger can understand and try.

- Empty, loading and error states; accessibility pass (`Show data` tables, focus rings).
- Security pass before any public link: a security review of auth, uploads and keys; rate limits; an access gate for a hosted demo.
- Deploy: Vercel for web, Fly.io for voice and API, Langfuse Cloud.
- README with architecture diagram, sample analytics screenshots, and a short demo video (`brag`).
- Optional: client-side latency using Daily network stats.

**Exit check:** a public demo link works end to end and the README explains the design in under five minutes of reading.

---

## Later (not scheduled)
- In-app persona editor.
- Client-side mic-to-speaker latency measurement.
- Speech-to-speech mode (OpenAI Realtime, Gemini Live) as a comparison target.
- Scripted test calls for repeatable benchmarks.
- Alerts when p95 goes over a threshold.

## Risks to watch
- **Voice quality and echo** can hide real latency problems. Use headphones when testing.
- **Provider API changes** (Pipecat moves fast). Pin versions in M1.
- **Cost** of repeated test calls. Set provider spend limits in M0.
- **Scope creep** into UI polish before M3 data is right. Finish M3 before M4 starts.
