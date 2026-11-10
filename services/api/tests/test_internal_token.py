import pytest

from app.config import settings

EV = {"events": [{"seq": 1, "type": "session_started", "t_ms": 0.0}]}


@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(settings, "internal_token", "t0ken")
    return {"x-internal-token": "t0ken"}


async def test_events_and_audio_need_token_when_set(client, token):
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    assert (await client.post(f"/sessions/{sid}/events", json=EV)).status_code == 401
    assert (await client.post(f"/sessions/{sid}/events", json=EV, headers={"x-internal-token": "wrong"})).status_code == 401
    assert (await client.put(f"/sessions/{sid}/audio", content=b"x" * 100)).status_code == 401
    assert (await client.post(f"/sessions/{sid}/events", json=EV, headers=token)).status_code == 204


async def test_no_token_configured_means_open(client):
    sid = (await client.post("/sessions", json={})).json()["session_id"]
    assert (await client.post(f"/sessions/{sid}/events", json=EV)).status_code == 204


async def test_persona_name_is_validated(client):
    r = await client.post("/sessions", json={"persona": "../../README"})
    assert r.status_code == 422


@pytest.mark.parametrize("voice_id", ["../voices", "a/b", "a?x=1", "a#b", "", "x" * 129, "a b"])
async def test_voice_id_cannot_carry_url_characters(client, voice_id):
    r = await client.post("/sessions", json={"tts": {"provider": "cartesia", "voice": voice_id}})
    assert r.status_code == 422


@pytest.mark.parametrize("voice_id", ["aura-2-thalia-en", "694f9389-aac1-45b6-b726-9d9369183238", "21m00Tcm4TlvDq8ikWAM"])
async def test_normal_voice_ids_still_work(client, voice_id, monkeypatch):
    async def ok(*a, **k):
        return None

    monkeypatch.setattr("app.voices.ensure_voice", ok)
    assert (await client.post("/sessions", json={"tts": {"provider": "cartesia", "voice": voice_id}})).status_code == 201


def test_wav_header_claiming_zero_frame_rate_has_no_duration(tmp_path, monkeypatch):
    import io
    import struct
    import uuid
    import wave

    from app import storage

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(16000), w.writeframes(b"\0\0" * 10)
    raw = bytearray(buf.getvalue())
    raw[24:28] = struct.pack("<I", 0)  # sample rate field
    sid = uuid.uuid4()
    monkeypatch.setattr(storage.settings, "audio_dir", str(tmp_path))
    (tmp_path / f"{sid}.wav").write_bytes(bytes(raw))
    assert storage.audio_duration_ms(sid) is None
