import pytest
from fastapi.testclient import TestClient

import persona


@pytest.mark.parametrize("name", ["../../README", "..", "a/b", "", "x" * 65, "a.md", "a\x00b"])
def test_persona_rejects_path_tricks(name):
    with pytest.raises(ValueError):
        persona.load_persona(name)


def test_persona_loads_real_file():
    prompt, version = persona.load_persona("default")
    assert prompt and version is None


def test_start_and_stop_need_token_when_set(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    import server

    c = TestClient(server.app)
    body = {"session_id": "s1"}
    monkeypatch.setenv("VANA_INTERNAL_TOKEN", "t0ken")
    assert c.post("/start", json=body).status_code == 401
    assert c.post("/stop", json=body).status_code == 401
    assert c.post("/stop", json=body, headers={"x-internal-token": "t0ken"}).status_code == 202
    monkeypatch.delenv("VANA_INTERNAL_TOKEN")
    assert c.post("/stop", json=body).status_code == 202


def test_busy_server_refuses_new_sessions(monkeypatch):
    import server

    monkeypatch.delenv("VANA_INTERNAL_TOKEN", raising=False)
    monkeypatch.setenv("VANA_MAX_CONCURRENT", "2")
    monkeypatch.setattr(server, "pending", {})
    monkeypatch.setattr(server, "running", {})
    c = TestClient(server.app)
    body = {"stt": {"provider": "deepgram"}, "tts": {"provider": "cartesia"}}
    monkeypatch.setattr(server.SessionConfig, "validate", lambda self: None)
    assert c.post("/start", json={**body, "session_id": "a"}).status_code == 202
    assert c.post("/start", json={**body, "session_id": "b"}).status_code == 202
    r = c.post("/start", json={**body, "session_id": "c"})
    assert r.status_code == 503 and "busy" in r.json()["detail"]


def test_unconnected_sessions_expire(monkeypatch):
    import server

    monkeypatch.delenv("VANA_INTERNAL_TOKEN", raising=False)
    monkeypatch.setenv("VANA_PENDING_TTL_S", "0")
    monkeypatch.setattr(server, "pending", {})
    monkeypatch.setattr(server, "running", {})
    monkeypatch.setattr(server.SessionConfig, "validate", lambda self: None)
    c = TestClient(server.app)
    c.post("/start", json={"session_id": "old"})
    c.post("/start", json={"session_id": "new"})  # starting another prunes the expired one
    assert "old" not in server.pending


def test_offer_with_invented_pc_id_opens_no_connection(monkeypatch):
    import server

    calls = []

    async def fake_handle(request, webrtc_connection_callback):
        calls.append(request.pc_id)
        return {"sdp": "a", "type": "answer", "pc_id": request.pc_id}

    monkeypatch.setattr(server, "pending", {})
    monkeypatch.setattr(server.webrtc, "handle_web_request", fake_handle)
    monkeypatch.setitem(server.webrtc._pcs_map, "known-pc", object())
    c = TestClient(server.app)
    offer = {"sdp": "v=0", "type": "offer"}

    assert c.post("/api/offer", json=offer).status_code == 404  # no session, no pc_id
    assert c.post("/api/offer", json={**offer, "pc_id": "invented"}).status_code == 404
    assert calls == []  # nothing reached the WebRTC handler
    assert c.post("/api/offer", json={**offer, "pc_id": "known-pc"}).status_code == 200  # renegotiating a held connection
    assert calls == ["known-pc"]
