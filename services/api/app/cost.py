"""Per-session cost estimate from the catalog's prices. Unknown prices stay unknown, never guessed."""

from app import catalog


def _find(items: list[dict], key: str, value: str | None) -> dict | None:
    return next((i for i in items if i["id"] == value), None) if value else None


def estimate(session, tokens_in: int, tokens_out: int, tts_chars: int, duration_ms: float | None) -> dict:
    cat = catalog.load()

    stt = None
    p = cat["stt"].get(session.stt_provider)
    if p and duration_ms:
        m = _find(p["models"], "id", session.stt_model or p["default_model"])
        if m and m.get("price_per_min") is not None:
            stt = duration_ms / 60000 * m["price_per_min"]  # billed on audio streamed, about the call length

    llm = None
    p = cat["llm"].get(session.llm_provider)
    if p:
        m = _find(p["models"], "id", session.llm_model or p["default_model"])
        if m and m.get("in_per_m") is not None and m.get("out_per_m") is not None:
            llm = (tokens_in * m["in_per_m"] + tokens_out * m["out_per_m"]) / 1e6

    tts = None
    p = cat["tts"].get(session.tts_provider)
    if p:
        voice = _find(p["voices"], "id", session.tts_voice or p["default_voice"])
        price = (voice or {}).get("price_per_1k_chars", p.get("price_per_1k_chars"))  # a voice's own price wins
        if price is not None:
            tts = tts_chars / 1000 * price

    parts = {"stt": stt, "llm": llm, "tts": tts}
    known = [v for v in parts.values() if v is not None]
    r = lambda v: None if v is None else round(v, 5)  # noqa: E731
    return {
        **{k: r(v) for k, v in parts.items()},
        "total": r(sum(known)) if known else None,
        "complete": len(known) == 3,  # false when a price is unknown, so the total is a lower bound
    }
