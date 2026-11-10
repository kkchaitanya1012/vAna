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

## Before you expose it to the internet

Local defaults are open on purpose. Before anyone else can reach the API or the voice server:

- Set `VANA_INTERNAL_TOKEN` (a long random value, same in the API and voice server environments). Without it, the voice server's `/start` and `/stop` and the API's event and audio-upload routes accept anyone, so a stranger could start calls on your provider keys.
- The voice server's `/api/offer` has to be public for browsers to connect. It only accepts a session that the API registered through `/start`.
- Add your own sign-in or rate limits in front (see the optional extension seams in `services/api/app/extensions.py`), and set spend limits in each provider's dashboard.
- The model and voice a caller picks are passed to the provider as given when the catalog allows a custom id (`custom_model`, `custom_voice`). Pin them if you host a public demo.
- The web app sets no security headers by default. Add a Content-Security-Policy and `X-Frame-Options` if you serve it publicly, since it asks for the microphone.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
