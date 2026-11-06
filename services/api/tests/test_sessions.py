import uuid


async def test_create_starts_voice_and_returns_offer_url(client, voice):
    r = await client.post("/sessions", json={"persona": "default"})
    assert r.status_code == 201
    body = r.json()
    assert body["offer_url"].endswith("/api/offer")
    sid, cfg = voice.started[0]
    assert sid == body["session_id"]
    assert cfg["llm"]["provider"] == "openrouter"
    got = (await client.get(f"/sessions/{sid}")).json()
    assert got["status"] == "starting"


async def test_voice_failure_marks_session_failed(client, voice):
    voice.fail = "Unknown LLM provider 'x'"
    r = await client.post("/sessions", json={})
    assert r.status_code == 502
    rows = (await client.get("/sessions")).json()
    assert rows[0]["status"] == "failed"
    assert "Unknown LLM" in rows[0]["error"]


async def test_events_drive_lifecycle_and_dedupe(client):
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    ev = {"events": [{"seq": 1, "type": "session_started", "t_ms": 0.0}]}
    assert (await client.post(f"/sessions/{sid}/events", json=ev)).status_code == 204
    assert (await client.post(f"/sessions/{sid}/events", json=ev)).status_code == 204  # duplicate
    assert (await client.get(f"/sessions/{sid}")).json()["status"] == "live"
    closed = {"events": [{"seq": 2, "type": "session_closed", "t_ms": 5000.0, "payload": {"duration_ms": 5000}}]}
    await client.post(f"/sessions/{sid}/events", json=closed)
    s = (await client.get(f"/sessions/{sid}")).json()
    assert s["status"] == "complete" and s["ended_at"].endswith("+00:00")


async def test_end_is_idempotent_and_stops_voice(client, voice):
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    assert (await client.post(f"/sessions/{sid}/end")).status_code == 202
    r = await client.post(f"/sessions/{sid}/end")
    assert r.json()["status"] == "complete"
    assert voice.stopped == [sid]  # second call does not stop again


async def test_unknown_session_404(client):
    assert (await client.get(f"/sessions/{uuid.uuid4()}")).status_code == 404
    assert (await client.post(f"/sessions/{uuid.uuid4()}/end")).status_code == 404


async def test_closing_a_session_derives_turns_and_summary(client):
    from tests.test_metrics import normal_session

    sid = (await client.post("/sessions", json={})).json()["session_id"]
    payload = [
        {"seq": e.seq, "type": e.type, "t_ms": e.t_ms, "turn_idx": e.turn_idx, "payload": e.payload}
        for e in normal_session()
    ]
    payload.append({"seq": 99, "type": "session_closed", "t_ms": 9500, "payload": {"duration_ms": 9500}})
    for _ in range(2):  # delivering the same batch twice must not duplicate turns
        assert (await client.post(f"/sessions/{sid}/events", json={"events": payload})).status_code == 204

    s = (await client.get(f"/sessions/{sid}")).json()
    assert s["status"] == "complete"
    assert [t["idx"] for t in s["turns"]] == [0, 1]
    assert s["turns"][1]["stages"]["v2v"] == 1300
    assert s["turns"][1]["user_text"] == "what time is it"
    assert s["summary"]["v2v_p50"] == 1300


def _wav(seconds=1.0, rate=16000):
    import io
    import wave

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * 2 * int(rate * seconds))
    return buf.getvalue()


async def test_audio_upload_download_and_offset(client, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "audio_dir", str(tmp_path))
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    assert (await client.get(f"/sessions/{sid}/audio")).status_code == 404
    assert (await client.get(f"/sessions/{sid}")).json()["audio"] is None

    await client.post(f"/sessions/{sid}/events", json={"events": [
        {"seq": 1, "type": "recording_started", "t_ms": 350.0}]})
    wav = _wav(2.0)
    r = await client.put(f"/sessions/{sid}/audio", content=wav, headers={"content-type": "audio/wav"})
    assert r.status_code == 204

    got = await client.get(f"/sessions/{sid}/audio")
    assert got.status_code == 200 and got.content == wav
    part = await client.get(f"/sessions/{sid}/audio", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206 and len(part.content) == 100  # seeking works

    detail = (await client.get(f"/sessions/{sid}")).json()
    assert detail["audio"]["offset_ms"] == 350.0
    assert abs(detail["audio"]["duration_ms"] - 2000) < 1
    assert not list(tmp_path.glob("*.part"))


async def test_audio_upload_rejects_junk_and_unknown_session(client, tmp_path, monkeypatch):
    import uuid

    from app.config import settings

    monkeypatch.setattr(settings, "audio_dir", str(tmp_path))
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    assert (await client.put(f"/sessions/{sid}/audio", content=b"nope")).status_code == 400
    assert (await client.put(f"/sessions/{uuid.uuid4()}/audio", content=_wav())).status_code == 404
    monkeypatch.setattr(settings, "max_audio_mb", 0)
    assert (await client.put(f"/sessions/{sid}/audio", content=_wav())).status_code == 413
    assert list(tmp_path.iterdir()) == []


async def _closed_session(client, persona="default", llm="meta-llama/llama-3.3-70b-instruct", tts="deepgram"):
    from tests.test_metrics import normal_session

    sid = (await client.post("/sessions", json={"persona": persona, "llm": {"provider": "openrouter", "model": llm},
                                                "tts": {"provider": tts}})).json()["session_id"]
    payload = [
        {"seq": e.seq, "type": e.type, "t_ms": e.t_ms, "turn_idx": e.turn_idx, "payload": e.payload}
        for e in normal_session()
    ]
    payload.append({"seq": 99, "type": "session_closed", "t_ms": 9500, "payload": {"duration_ms": 9500}})
    await client.post(f"/sessions/{sid}/events", json={"events": payload})
    return sid


async def test_list_filters_by_persona_and_provider(client):
    a = await _closed_session(client, persona="default", tts="deepgram")
    b = await _closed_session(client, persona="interviewer", tts="cartesia")
    assert {r["id"] for r in (await client.get("/sessions?persona=interviewer")).json()} == {b}
    assert {r["id"] for r in (await client.get("/sessions?provider=deepgram")).json()} >= {a}
    assert b not in {r["id"] for r in (await client.get("/sessions?provider=deepgram&persona=default")).json()}


async def test_compare_returns_sessions_in_order_with_v2v(client):
    a = await _closed_session(client)
    b = await _closed_session(client, tts="cartesia")
    r = await client.get(f"/compare?ids={b},{a}")
    assert r.status_code == 200
    got = r.json()
    assert [g["session"]["id"] for g in got] == [b, a]
    assert got[0]["v2v"] == [1300]
    assert got[0]["session"]["summary"]["v2v_p50"] == 1300


async def test_compare_validates_ids(client):
    a = await _closed_session(client)
    assert (await client.get(f"/compare?ids={a}")).status_code == 422          # need 2
    assert (await client.get(f"/compare?ids={a},nope")).status_code == 422     # bad id
    assert (await client.get(f"/compare?ids={a},{uuid.uuid4()}")).status_code == 404
    five = ",".join(str(uuid.uuid4()) for _ in range(5))
    assert (await client.get(f"/compare?ids={five}")).status_code == 422
