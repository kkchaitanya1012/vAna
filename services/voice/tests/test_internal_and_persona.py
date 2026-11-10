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
