# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: product managers and account leads at agencies who build voice agents for clients. They are not engineers. They need to decide which speech-to-text, language model and voice stack to recommend, and to show a client why. They open vAna after a test call, or in a client meeting, and want an answer in plain language before any number.

Secondary: voice-AI engineers who run many calls and read the detail; and portfolio reviewers who judge the craft of the demo in under a minute.

## Product Purpose
vAna records a voice call with an agent and shows where each turn spent its time (hearing, thinking, voicing, delivery), what the call cost, and how one stack compares with another. Success: a non-technical person can run two calls, open Compare, and say which stack to pick and why, without asking an engineer.

## Positioning
A latency instrument written in plain language. Most voice-observability tools are built for engineers reading traces; vAna leads with a verdict ("feels natural", "noticeable pause"), the cause (the slowest step), the cost, and a replay they can hear.

## Operating Context
- Used on laptops and large screens in client meetings, and on phones when sharing a result.
- A session is a real call: the user talks, ends the call, then reads the analysis. Comparisons use 2 to 4 sessions.
- Providers are swappable per call (9 speech-to-text, 8 voice, 3 language-model hosts), so stack names appear everywhere.

## Capabilities and Constraints
- Five screens: New session, Live call, Sessions list, Session analytics, Compare.
- Data per session: per-turn timings in four stages that sum to response time, transcript, audio replay with synced selection, token and cost estimates (estimates only; unknown prices stay blank, never guessed).
- Latency thresholds: under 0.8 s natural, 0.8 to 1.5 s noticeable, over 1.5 s slow.
- Stack: Next.js 16, Tailwind v4, React Compiler lint rules. No new heavy dependencies without a reason.
- Must work at phone width and on desktop.

## Brand Commitments
- Name: vAna.
- Inter stays as the text face (user's explicit choice).
- The four stage colors stay: Hearing blue, Thinking orange, Voicing green, Delivery violet. Validated for color-blind separation. A stage color is never reused for anything else.

## Evidence on Hand
Real recorded sessions in the dev database, with audio, transcripts and timings. No customers, testimonials or benchmarks exist; none may be invented.

## Product Principles
1. Verdict before numbers: every screen opens with what it means, in plain words.
2. Plain language over jargon; the technical term is one hover away.
3. One stage, one color, everywhere.
4. A measurement is never decoration: every mark on a chart is data.
5. The same call must be readable on a phone and presentable on a projector.

## Accessibility & Inclusion
WCAG 2.1 AA text contrast. Color is never the only signal (labels or text on every stage and verdict). Reduced motion and reduced transparency respected. Charts have a data-table fallback.
