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
