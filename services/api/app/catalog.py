"""Provider catalog (config/providers.yaml): what can be chosen, and what it costs."""

import os
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import dotenv_values

from app.config import ROOT

CATALOG_PATH = ROOT / "config" / "providers.yaml"


@lru_cache(maxsize=4)
def _load(mtime: float) -> dict:
    return yaml.safe_load(CATALOG_PATH.read_text())


def load() -> dict:
    return _load(CATALOG_PATH.stat().st_mtime)  # reloads when the file is edited


def key_value(env_name: str) -> str:
    """The key, or "". Server side only: values are never sent to the browser."""
    if v := os.environ.get(env_name):
        return v
    env_file = Path(ROOT / ".env")
    return (dotenv_values(env_file).get(env_name) or "").strip() if env_file.is_file() else ""


def key_present(env_name: str) -> bool:
    return bool(key_value(env_name))


def public() -> dict:
    """The catalog for the UI. Never includes key values, only whether a key is set."""
    out: dict = {}
    for stage, providers in load().items():
        if stage not in ("stt", "llm", "tts"):
            continue
        out[stage] = [
            {**{k: v for k, v in p.items() if k != "env"}, "id": pid, "available": key_present(p["env"]), "env": p["env"]}
            for pid, p in providers.items()
        ]
    return out
