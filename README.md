# vAna

Voice session analytics. Talk to a voice agent, end the call, then see where each turn spent its time.

Status: M0 to M7 built (setup, talking bot, browser session flow, per-turn timing capture, analytics board, recording and replay, switchable providers and personas with cost estimates, side-by-side session comparison). See `ROADMAP.md`.

## Run locally (M2)

Needs Python 3.12, Node 20+, and keys in `.env` (copy `.env.example`): Deepgram, OpenRouter, Cartesia.

```bash
# 1. API (SQLite for now; Postgres via docker compose from M3)
cd services/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL=sqlite+aiosqlite:////tmp/vana-dev.db .venv/bin/alembic upgrade head
DATABASE_URL=sqlite+aiosqlite:////tmp/vana-dev.db .venv/bin/uvicorn app.main:app --port 8000

# 2. Voice server
cd services/voice && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python server.py            # port 8100

# 3. Web
cd apps/web && npm install && npm run dev   # http://localhost:3000
```

Tests: `cd services/api && .venv/bin/python -m pytest`, and the same in `services/voice`.

Providers, models, voices and prices live in `config/providers.yaml` (edit prices there; they are estimates). Personas are files in `services/voice/personas/`. A provider becomes selectable once its key is in `.env`.

Docs: `Plan.md` (architecture), `DESIGN.md` (UI system and contracts), `ROADMAP.md` (milestones).

## Adding a provider or voice

Everything selectable is in `config/providers.yaml`. A provider is one entry: its API key name (`env`), the Pipecat class that runs it (`service`), and its models or voices. No code change is needed for providers that use Pipecat's standard `api_key` plus `Settings(model=..., voice=...)` pattern. `services/voice/tests/test_providers.py` builds every entry, so a wrong class path fails the tests.

| Step | Providers |
|---|---|
| Speech to text | Deepgram, AssemblyAI, OpenAI, Groq Whisper, ElevenLabs Scribe, Cartesia Ink, Soniox, Gladia, Together AI |
| Voice | Deepgram Aura (53 voices), Groq Orpheus, OpenAI, Cartesia (full library, live), ElevenLabs (full library, live), xAI, Together AI, Smallest AI |

Tested with real calls: Deepgram, Groq Whisper, Cartesia (speech to text and voice), Deepgram Aura, Groq Orpheus. The rest build correctly but have not been run with a real key; expect to fix small details. Voice lists for Cartesia and ElevenLabs are fetched with your key (`GET /providers/tts/{provider}/voices`, cached for an hour). Providers marked `custom_voice` also accept any voice id typed by hand.
