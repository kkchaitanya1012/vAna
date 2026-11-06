"""Voice lists. Static ones come from the catalog; Cartesia and ElevenLabs are fetched live with the user's key."""

import time

import httpx

from app import catalog

TTL_S = 3600
MAX_VOICES = 1000
_cache: dict[str, tuple[float, list[dict]]] = {}


def _static(entry: dict) -> list[dict]:
    return [
        {"id": v["id"], "label": v["label"], "detail": None, "price_per_1k_chars": v.get("price_per_1k_chars")}
        for v in entry.get("voices", [])
    ]


async def _cartesia(c: httpx.AsyncClient, key: str) -> list[dict]:
    out, cursor = [], None
    while len(out) < MAX_VOICES:
        params = {"limit": 100, **({"starting_after": cursor} if cursor else {})}
        r = await c.get("https://api.cartesia.ai/voices", params=params,
                        headers={"X-API-Key": key, "Cartesia-Version": "2025-04-16"})
        r.raise_for_status()
        j = r.json()
        for v in j.get("data", []):
            if v.get("status", "active") != "active":
                continue
            bits = [v.get("language"), v.get("gender"), v.get("country")]
            out.append({"id": v["id"], "label": v.get("name") or v["id"],
                        "detail": " · ".join(b for b in bits if b) or None, "price_per_1k_chars": None})
        cursor = j.get("next_page")
        if not j.get("has_more") or not cursor:
            break
    return out


async def _elevenlabs(c: httpx.AsyncClient, key: str) -> list[dict]:
    out, token = [], None
    while len(out) < MAX_VOICES:
        params = {"page_size": 100, **({"next_page_token": token} if token else {})}
        r = await c.get("https://api.elevenlabs.io/v2/voices", params=params, headers={"xi-api-key": key})
        r.raise_for_status()
        j = r.json()
        for v in j.get("voices", []):
            lab = v.get("labels") or {}
            bits = [lab.get("gender"), lab.get("accent"), lab.get("use_case") or v.get("category")]
            out.append({"id": v["voice_id"], "label": v.get("name") or v["voice_id"],
                        "detail": " · ".join(b for b in bits if b) or None, "price_per_1k_chars": None})
        token = j.get("next_page_token")
        if not j.get("has_more") or not token:
            break
    return out


_LIVE = {"cartesia": _cartesia, "elevenlabs": _elevenlabs}


async def list_voices(provider: str) -> dict:
    """{source: live|catalog, voices: [...], error?: str}. Falls back to the catalog list if the vendor call fails."""
    entry = catalog.load()["tts"].get(provider)
    if entry is None:
        raise KeyError(provider)
    live = entry.get("live_voices")
    key = catalog.key_value(entry["env"])
    if live in _LIVE and key:
        hit = _cache.get(provider)
        if hit and time.monotonic() - hit[0] < TTL_S:
            return {"source": "live", "voices": hit[1]}
        try:
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "vana/0.1"}) as c:
                voices = await _LIVE[live](c, key)
            if voices:
                _cache[provider] = (time.monotonic(), voices)
                return {"source": "live", "voices": voices}
        except httpx.HTTPError as e:
            # Never echo the key; the status or error class is enough to debug.
            status = getattr(getattr(e, "response", None), "status_code", None)
            return {"source": "catalog", "voices": _static(entry),
                    "error": f"Could not load the full {entry['label']} library ({status or type(e).__name__}). Showing a short list."}
    return {"source": "catalog", "voices": _static(entry)}


class VoiceUnavailable(Exception):
    """The chosen voice cannot be used with this account. The message is safe to show the user."""


async def ensure_voice(provider: str, voice_id: str | None) -> None:
    """Check a typed or pasted voice id before a call starts, so a bad id fails here with a clear message
    instead of 9 seconds into the call. ElevenLabs library voices are added to the account on first use."""
    if not voice_id or provider not in ("elevenlabs", "cartesia"):
        return
    entry = catalog.load()["tts"].get(provider)
    key = catalog.key_value(entry["env"]) if entry else ""
    if not key:
        return  # the voice server reports the missing key
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "vana/0.1"}) as c:
            if provider == "cartesia":
                r = await c.get(f"https://api.cartesia.ai/voices/{voice_id}",
                                headers={"X-API-Key": key, "Cartesia-Version": "2025-04-16"})
                if r.status_code in (400, 404):
                    raise VoiceUnavailable(f"Cartesia has no voice with id {voice_id}.")
                return
            h = {"xi-api-key": key}
            if (await c.get(f"https://api.elevenlabs.io/v1/voices/{voice_id}", headers=h)).status_code == 200:
                return
            found = await c.get("https://api.elevenlabs.io/v1/shared-voices", headers=h,
                                params={"page_size": 5, "search": voice_id})
            match = next((v for v in found.json().get("voices", []) if v.get("voice_id") == voice_id), None) if found.status_code == 200 else None
            if match is None:
                raise VoiceUnavailable(f"ElevenLabs has no voice with id {voice_id}. Check the id.")
            added = await c.post(f"https://api.elevenlabs.io/v1/voices/add/{match['public_owner_id']}/{voice_id}",
                                 headers=h, json={"new_name": match.get("name") or voice_id})
            if added.status_code >= 400:
                raise VoiceUnavailable(
                    f"{match.get('name', 'This voice')} is a library voice and could not be added to your ElevenLabs account "
                    f"({added.status_code}). Open it in the ElevenLabs Voice Library, choose Add to My Voices, then try again.")
            _cache.pop("elevenlabs", None)  # the account's voice list changed
    except httpx.HTTPError:
        return  # vendor unreachable: let the call try anyway
