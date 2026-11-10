# Contributing to vAna

Thanks for helping. vAna is a small project, so the process is light.

## Set up

You need Python 3.12 and Node 20+. The quickstart in the [README](README.md#quickstart) gets all three parts running: the API (`services/api`), the voice server (`services/voice`) and the web app (`apps/web`).

Real calls need provider keys in `.env` (copy `.env.example`). You do not need keys to run the tests.

Never commit `.env`. Only `.env.example` is tracked.

## Run the checks

```bash
cd services/api   && .venv/bin/python -m pytest
cd services/voice && .venv/bin/python -m pytest
cd apps/web       && npm run lint
```

Run the API and voice tests from their own folders. They configure the app differently.

## Where things live

- **Providers, models, voices and prices:** `config/providers.yaml`. Adding a provider is usually one entry and no code. See "Adding a provider or voice" in the README. `services/voice/tests/test_providers.py` builds every entry, so a wrong class path fails the tests.
- **Personas:** Markdown files in `services/voice/personas/`. The first line is shown as the preview.
- **Metrics:** formulas are defined in `DESIGN.md` section 2.6 and implemented in `services/api/app/metrics.py`. Please do not add new formulas without opening an issue first, since they change what every chart means.
- **UI:** `DESIGN.md` Part 1 is the design system. Where a tool or template default conflicts with it, `DESIGN.md` wins: fixed stage colors, Inter, tabular mono numbers.

## Pull requests

- Keep a pull request to one change. Include a test when you fix a bug or add behavior.
- Say what you tested and how. If you changed something you could not run (for example a provider you have no key for), say so.
- Use short, conventional commit messages (`feat:`, `fix:`, `docs:`, `security:`), like the existing history.
- Do not add secrets, recordings or personal data, including in tests and screenshots. Use fictional sample data.
- For anything that touches authentication, request handling, uploads or API keys, read [SECURITY.md](SECURITY.md) first.

## Reporting bugs and ideas

Open an issue with what you did, what you expected, and what happened. For a latency problem, include the stack you used (speech to text, language model, voice) and the session's per-step numbers, not the audio.

Security problems do not go in public issues. Follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the Apache License 2.0, as in section 5 of the license.
