# services/voice — Pipecat voice server

Contracts: `DESIGN.md` sections 2.2 (lifecycle), 2.4 (events), 2.7 (provider registry), 2.8 (Langfuse).

## Rules
- One monotonic clock (`t_ms`) for all events.
- Provider factories read keys from env. Missing key returns 400 from `/start`.
- Voice control endpoints are internal only. Never expose port 8100 publicly.
