import pytest

import providers


def keys(monkeypatch, *names):
    cat = providers.catalog()
    for n in {p["env"] for stage in cat.values() for p in stage.values()}:
        monkeypatch.delenv(n, raising=False)
    for n in names:
        monkeypatch.setenv(n, "test-key")


def test_unknown_provider_lists_supported(monkeypatch):
    keys(monkeypatch)
    with pytest.raises(ValueError, match="Unknown LLM provider 'nope'.*groq.*openrouter"):
        providers.validate("llm", {"provider": "nope"})


def test_missing_key_names_the_variable(monkeypatch):
    keys(monkeypatch)
    with pytest.raises(ValueError, match="Groq is not set up: add GROQ_API_KEY"):
        providers.validate("llm", {"provider": "groq"})


def _all(stage):
    return [(pid, p) for pid, p in providers.catalog()[stage].items()]


@pytest.mark.parametrize("pid,entry", _all("stt"), ids=[p for p, _ in _all("stt")])
def test_every_stt_provider_builds_with_each_model(monkeypatch, pid, entry):
    keys(monkeypatch, entry["env"])
    for m in entry["models"]:
        cfg = {"provider": pid, "model": m["id"]}
        providers.validate("stt", cfg)
        assert providers.build_stt(cfg)._settings.model == m["id"]


@pytest.mark.parametrize("pid,entry", _all("tts"), ids=[p for p, _ in _all("tts")])
def test_every_tts_provider_builds_with_default_and_custom_voice(monkeypatch, pid, entry):
    keys(monkeypatch, entry["env"])
    for voice in (entry["default_voice"], "some-typed-voice-id"):
        cfg = {"provider": pid, "voice": voice}
        providers.validate("tts", cfg)
        assert providers.build_tts(cfg)._settings.voice == voice


@pytest.mark.parametrize("provider,model,key,name", [
    ("openrouter", "meta-llama/llama-3.3-70b-instruct", "OPENROUTER_API_KEY", "OpenRouter"),
    ("groq", "openai/gpt-oss-120b", "GROQ_API_KEY", "Groq"),
    ("openai", "gpt-4o-mini", "OPENAI_API_KEY", "OpenAI"),
])
def test_every_llm_provider_builds_with_model_and_prompt(monkeypatch, provider, model, key, name):
    keys(monkeypatch, key)
    svc = providers.build_llm({"provider": provider, "model": model}, "Be brief.")
    assert type(svc).__name__.startswith(name)
    assert svc._settings.model == model
    assert svc._settings.system_instruction == "Be brief."


def test_catalog_has_a_default_for_every_provider():
    cat = providers.catalog()
    for p in cat["stt"].values():
        assert p["default_model"] in [m["id"] for m in p["models"]]
    for p in cat["stt"].values():
        assert p["service"].startswith("pipecat.services.")
    for p in cat["llm"].values():
        assert p["default_model"] in [m["id"] for m in p["models"]]
    for p in cat["tts"].values():
        assert p["default_voice"] in [v["id"] for v in p["voices"]]
        assert len({v["id"] for v in p["voices"]}) == len(p["voices"]), "duplicate voice id"
        assert p["service"].startswith("pipecat.services.")
