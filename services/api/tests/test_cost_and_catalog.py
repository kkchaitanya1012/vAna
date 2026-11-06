from types import SimpleNamespace

from app import cost


def session(**kw):
    base = dict(stt_provider="deepgram", stt_model=None, llm_provider="openrouter",
                llm_model="meta-llama/llama-3.3-70b-instruct", tts_provider="cartesia", tts_voice=None)
    return SimpleNamespace(**{**base, **kw})


def test_cost_known_prices():
    c = cost.estimate(session(), tokens_in=100_000, tokens_out=10_000, tts_chars=2_000, duration_ms=120_000)
    assert c["llm"] == round((100_000 * 0.20 + 10_000 * 0.52) / 1e6, 5)  # 0.0252
    assert c["stt"] == round(2 * 0.0077, 5)
    assert c["tts"] == round(2 * 0.05, 5)
    assert c["complete"] is True
    assert c["total"] == round(c["stt"] + c["llm"] + c["tts"], 5)


def test_unknown_model_price_is_left_out_not_guessed():
    c = cost.estimate(session(llm_model="some/custom-model"), 1000, 100, 500, 60_000)
    assert c["llm"] is None and c["complete"] is False
    assert c["total"] == round(c["stt"] + c["tts"], 5)  # a lower bound


def test_voice_price_beats_provider_default():
    cheap = cost.estimate(session(tts_provider="deepgram", tts_voice="aura-asteria-en"), 0, 0, 2_000, 1000)
    dear = cost.estimate(session(tts_provider="deepgram", tts_voice="aura-2-helena-en"), 0, 0, 2_000, 1000)
    assert cheap["tts"] == 0.03 and dear["tts"] == 0.06  # $0.015 and $0.030 per 1k characters
    assert cost.estimate(session(tts_provider="groq", tts_voice="autumn"), 0, 0, 1_000, 1000)["tts"] == 0.022


def test_provider_without_price_is_unknown():
    c = cost.estimate(session(tts_provider="openai"), 1000, 100, 500, 60_000)
    assert c["tts"] is None and c["complete"] is False


def test_everything_unknown_gives_no_total():
    c = cost.estimate(session(stt_provider="gladia", llm_model="x", tts_provider="openai"), 1, 1, 1, 1000)
    assert c["total"] is None


async def test_providers_endpoint_reports_availability_without_leaking_keys(client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "super-secret-value")
    monkeypatch.delenv("ASSEMBLYAI_API_KEY", raising=False)
    r = await client.get("/providers")
    assert r.status_code == 200
    assert "super-secret-value" not in r.text
    body = r.json()
    groq = next(p for p in body["llm"] if p["id"] == "groq")
    assert groq["available"] is True and groq["env"] == "GROQ_API_KEY"
    assert {"deepgram", "assemblyai", "openai", "groq"} <= {p["id"] for p in body["stt"]}
    assert all("models" in p for p in body["llm"])


async def test_personas_endpoint_proxies_voice(client):
    r = await client.get("/personas")
    assert r.status_code == 200 and r.json()[0]["name"] == "default"


async def test_session_stores_prompt_hash_and_cost_on_close(client):
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    from tests.test_metrics import normal_session

    ev = [{"seq": e.seq, "type": e.type, "t_ms": e.t_ms, "turn_idx": e.turn_idx, "payload": e.payload} for e in normal_session()]
    ev.append({"seq": 99, "type": "session_closed", "t_ms": 60_000, "payload": {}})
    await client.post(f"/sessions/{sid}/events", json={"events": ev})
    s = (await client.get(f"/sessions/{sid}")).json()
    assert s["prompt_hash"] == "abc12345"
    assert s["summary"]["duration_ms"] == 60000
    assert s["summary"]["cost_usd"]["llm"] is not None and s["summary"]["cost_usd"]["total"] > 0


async def test_voices_static_list_has_prices(client):
    r = await client.get("/providers/tts/deepgram/voices")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "catalog" and len(body["voices"]) == 53
    assert {v["price_per_1k_chars"] for v in body["voices"]} == {0.015, 0.03}


async def test_unknown_voice_provider_404(client):
    assert (await client.get("/providers/tts/nope/voices")).status_code == 404


async def test_live_voices_are_fetched_cached_and_fall_back(client, monkeypatch):
    from app import voices

    voices._cache.clear()
    monkeypatch.setattr("app.catalog.key_value", lambda env: "k")
    calls = []

    async def fake(c, key):
        calls.append(key)
        return [{"id": "v1", "label": "One", "detail": "en", "price_per_1k_chars": None}]

    monkeypatch.setitem(voices._LIVE, "cartesia", fake)
    for _ in range(2):
        body = (await client.get("/providers/tts/cartesia/voices")).json()
    assert body["source"] == "live" and body["voices"][0]["id"] == "v1"
    assert len(calls) == 1  # second request served from cache

    voices._cache.clear()
    import httpx

    async def boom(c, key):
        raise httpx.ConnectError("x")

    monkeypatch.setitem(voices._LIVE, "cartesia", boom)
    body = (await client.get("/providers/tts/cartesia/voices")).json()
    assert body["source"] == "catalog" and "Could not load" in body["error"]


async def test_unusable_voice_is_refused_before_the_call_starts(client, voice, monkeypatch):
    from app import voices

    async def refuse(provider, voice_id):
        raise voices.VoiceUnavailable("ElevenLabs has no voice with id nope. Check the id.")

    monkeypatch.setattr(voices, "ensure_voice", refuse)
    r = await client.post("/sessions", json={"tts": {"provider": "elevenlabs", "voice": "nope"}})
    assert r.status_code == 422 and "no voice with id nope" in r.json()["detail"]
    assert voice.started == []  # the voice server was never asked to start


async def test_ensure_voice_skips_providers_without_a_check(monkeypatch):
    from app import voices

    await voices.ensure_voice("deepgram", "aura-asteria-en")  # no network, no error
    await voices.ensure_voice("elevenlabs", None)
