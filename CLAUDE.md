# vAna — Agent Instructions

Voice session analytics app. User talks to a voice agent, ends the session, views per-turn latency analytics.

## Read first
- `Plan.md`: scope, architecture, build phases.
- `ROADMAP.md`: milestones M0-M8 with exit checks. Work in milestone order.
- `DESIGN.md`: Part 1 UI design system, Part 2 technical contracts (API, events, DB, metrics).

If a tool or template default conflicts with `DESIGN.md`, `DESIGN.md` wins (fixed stage colors, Inter, tabular mono numbers).

## Rules
- Follow milestone order in `ROADMAP.md`. Do not start a milestone before the previous exit check passes.
- Never commit `.env`. Keys live in `.env`; commit `.env.example` only.
- Metric formulas come from `DESIGN.md` section 2.6. Do not invent new ones.
