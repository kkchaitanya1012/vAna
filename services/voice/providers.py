"""Builds Pipecat services from a session config. The catalog is config/providers.yaml, shared with the API."""

import importlib
import os
from pathlib import Path

import yaml

CATALOG_PATH = Path(__file__).resolve().parents[2] / "config" / "providers.yaml"


def catalog() -> dict:
    return yaml.safe_load(CATALOG_PATH.read_text())


def _entry(stage: str, provider: str) -> dict:
    cat = catalog()[stage]
    if provider not in cat:
        raise ValueError(f"Unknown {stage.upper()} provider '{provider}'. Supported: {sorted(cat)}")
    return cat[provider]


def validate(stage: str, cfg: dict) -> None:
    """Raise ValueError with a plain message if the provider is unknown or its key is missing."""
    entry = _entry(stage, cfg.get("provider", ""))
    if not os.getenv(entry["env"]):
        raise ValueError(f"{entry['label']} is not set up: add {entry['env']} to .env")


def _service(entry: dict):
    """Load the pipecat class named in the catalog (`service: pipecat.services.x.y.Class`)."""
    module, _, name = entry["service"].rpartition(".")
    return getattr(importlib.import_module(module), name)


def build_stt(cfg: dict):
    entry = _entry("stt", cfg["provider"])
    Svc = _service(entry)
    model = cfg.get("model") or entry["default_model"]
    return Svc(api_key=os.environ[entry["env"]], settings=Svc.Settings(model=model))


def build_llm(cfg: dict, system_prompt: str):
    entry = _entry("llm", cfg["provider"])
    key = os.environ[entry["env"]]
    model = cfg.get("model") or entry["default_model"]
    if cfg["provider"] == "openrouter":
        from pipecat.services.openrouter.llm import OpenRouterLLMService as Svc
    elif cfg["provider"] == "groq":
        from pipecat.services.groq.llm import GroqLLMService as Svc
    else:
        from pipecat.services.openai.llm import OpenAILLMService as Svc
    return Svc(api_key=key, settings=Svc.Settings(model=model, system_instruction=system_prompt))


def build_tts(cfg: dict):
    entry = _entry("tts", cfg["provider"])
    Svc = _service(entry)
    voice = cfg.get("voice") or entry["default_voice"]
    return Svc(api_key=os.environ[entry["env"]], settings=Svc.Settings(voice=voice))
