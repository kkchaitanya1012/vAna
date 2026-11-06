"""Pure functions: raw voice events -> turns -> stage metrics -> session summary.

All times are ms since session start. Definitions follow DESIGN.md 2.6.
"""

from dataclasses import dataclass, field
from typing import Any

USER_FIELDS = ("user_start_ms", "user_stop_ms", "turn_end_ms", "stt_final_ms")


@dataclass
class RawEvent:
    seq: int
    type: str
    t_ms: float
    turn_idx: int | None = None
    payload: dict[str, Any] | None = None


@dataclass
class TurnData:
    idx: int
    user_text: str | None = None
    bot_text: str | None = None
    user_start_ms: float | None = None
    user_stop_ms: float | None = None
    turn_end_ms: float | None = None
    stt_final_ms: float | None = None
    llm_started_ms: float | None = None
    llm_first_token_ms: float | None = None
    tts_first_byte_ms: float | None = None
    bot_start_ms: float | None = None
    bot_stop_ms: float | None = None
    interrupted: bool = False
    tokens_in: int | None = None
    tokens_out: int | None = None
    tts_chars: int | None = None


def _first(evs: list[RawEvent], type_: str) -> RawEvent | None:
    return next((e for e in evs if e.type == type_), None)


def _all(evs: list[RawEvent], type_: str) -> list[RawEvent]:
    return [e for e in evs if e.type == type_]


def derive_turns(events: list[RawEvent]) -> list[TurnData]:
    """Order-independent: sorts by (t_ms, seq) first, so late delivery does not matter."""
    ordered = sorted(events, key=lambda e: (e.t_ms, e.seq))
    by_turn: dict[int, list[RawEvent]] = {}
    for e in ordered:
        if e.turn_idx is not None and e.turn_idx >= 0:
            by_turn.setdefault(e.turn_idx, []).append(e)

    turns: list[TurnData] = []
    for idx in sorted(by_turn):
        evs = by_turn[idx]
        t = TurnData(idx=idx)

        started = _first(evs, "user_started_speaking")
        if started:
            t.user_start_ms = started.t_ms - 1000 * float((started.payload or {}).get("start_secs") or 0)

        llm_started = _first(evs, "llm_started")
        bot_start = _first(evs, "bot_started_speaking")
        cutoff = min([e.t_ms for e in (llm_started, bot_start) if e], default=None)

        def before_response(e: RawEvent) -> bool:
            return cutoff is None or e.t_ms <= cutoff

        stops = [e for e in _all(evs, "user_stopped_speaking") if before_response(e)]
        if stops:
            last = stops[-1]
            t.user_stop_ms = last.t_ms - 1000 * float((last.payload or {}).get("stop_secs") or 0)

        ends = [e for e in _all(evs, "turn_end_detected") if before_response(e)]
        if ends:
            t.turn_end_ms = ends[-1].t_ms

        finals = [e for e in _all(evs, "stt_final") if before_response(e)] or _all(evs, "stt_final")
        if finals:
            t.stt_final_ms = finals[-1].t_ms
            t.user_text = " ".join(str((e.payload or {}).get("text", "")).strip() for e in finals).strip() or None

        if llm_started:
            t.llm_started_ms = llm_started.t_ms
        first_token = _first(evs, "llm_first_token")
        if first_token:
            t.llm_first_token_ms = first_token.t_ms
        tts_first = _first(evs, "tts_first_byte")
        if tts_first:
            t.tts_first_byte_ms = tts_first.t_ms
        if bot_start:
            t.bot_start_ms = bot_start.t_ms
        bot_stops = _all(evs, "bot_stopped_speaking")
        if bot_stops:
            t.bot_stop_ms = bot_stops[-1].t_ms

        texts = [str((e.payload or {}).get("text", "")).strip() for e in _all(evs, "llm_completed")]
        t.bot_text = " ".join(x for x in texts if x) or None
        t.interrupted = any(e.type == "interruption" for e in evs)

        usage = [e.payload or {} for e in evs if e.type == "metrics"]
        llm = [u for u in usage if u.get("kind") == "llm_usage"]
        if llm:
            t.tokens_in = sum(int(u.get("prompt_tokens") or 0) for u in llm)
            t.tokens_out = sum(int(u.get("completion_tokens") or 0) for u in llm)
        tts = [u for u in usage if u.get("kind") == "tts_chars"]
        if tts:
            t.tts_chars = sum(int(u.get("chars") or 0) for u in tts)
        elif t.bot_text:
            # Some voices (Deepgram Aura) report no character count. Billing is by characters sent,
            # which is the text the language model produced.
            t.tts_chars = len(t.bot_text)

        turns.append(t)
    return turns


def _diff(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    d = a - b
    return d if d >= 0 else None


def stage_metrics(t: TurnData) -> dict[str, float | None]:
    """Stage breakdown for one turn. The stacked stages sum exactly to `v2v` when all are present.

    endpoint = user_stop -> (turn end and final transcript, capped at LLM start)
    """
    ready = [x for x in (t.turn_end_ms, t.stt_final_ms) if x is not None]
    endpoint_at = max(ready) if ready else None
    if endpoint_at is not None and t.llm_started_ms is not None:
        endpoint_at = min(endpoint_at, t.llm_started_ms)
    return {
        "endpoint": _diff(endpoint_at, t.user_stop_ms),
        "turn_detection": _diff(t.turn_end_ms, t.user_stop_ms),
        "stt": _diff(t.stt_final_ms, t.user_stop_ms),
        "pre_llm": _diff(t.llm_started_ms, endpoint_at),
        "llm_ttft": _diff(t.llm_first_token_ms, t.llm_started_ms),
        "tts_ttfb": _diff(t.tts_first_byte_ms, t.llm_first_token_ms),
        "transport": _diff(t.bot_start_ms, t.tts_first_byte_ms),
        "v2v": _diff(t.bot_start_ms, t.user_stop_ms),
        "bot_duration": _diff(t.bot_stop_ms, t.bot_start_ms),
    }


def percentile(values: list[float], p: float) -> float | None:
    """Linear interpolation, as in DESIGN.md 2.6."""
    if not values:
        return None
    xs = sorted(values)
    k = (len(xs) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def _avg(vals: list[float]) -> float | None:
    return round(sum(vals) / len(vals), 1) if vals else None


def summarize(turns: list[TurnData]) -> dict[str, Any]:
    stages = [stage_metrics(t) for t in turns]
    v2v = [s["v2v"] for s in stages if s["v2v"] is not None]
    stage_avg = {
        k: _avg([s[k] for s in stages if s[k] is not None])
        for k in ("endpoint", "pre_llm", "llm_ttft", "tts_ttfb", "transport")
    }
    gaps = [
        nxt.user_start_ms - cur.bot_stop_ms
        for cur, nxt in zip(turns, turns[1:])
        if cur.bot_stop_ms is not None and nxt.user_start_ms is not None and nxt.user_start_ms >= cur.bot_stop_ms
    ]
    r = lambda x: None if x is None else round(x, 1)  # noqa: E731
    return {
        "turns": len(turns),
        "responded_turns": sum(1 for t in turns if t.bot_start_ms is not None),
        "v2v_p50": r(percentile(v2v, 50)),
        "v2v_p95": r(percentile(v2v, 95)),
        "v2v_max": r(max(v2v) if v2v else None),
        "stage_avg": stage_avg,
        "interruptions": sum(1 for t in turns if t.interrupted),
        "silence_gap_avg": _avg(gaps),
        "tokens_in": sum(t.tokens_in or 0 for t in turns),
        "tokens_out": sum(t.tokens_out or 0 for t in turns),
        "tts_chars": sum(t.tts_chars or 0 for t in turns),
    }
