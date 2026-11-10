"""Persona loading. File by default; Langfuse only when configured."""

import hashlib
import os
import re
from pathlib import Path

PERSONA_DIR = Path(__file__).parent / "personas"
_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}")


def load_persona(name: str) -> tuple[str, str | None]:
    """Return (system_prompt, version). Version is None for file personas."""
    if not _NAME.fullmatch(name):
        raise ValueError(f"Invalid persona name '{name}'")  # also blocks '../' reaching other files
    if os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"):
        from langfuse import Langfuse  # optional dependency

        prompt = Langfuse().get_prompt(name, label="production", type="text")
        return prompt.compile(), str(prompt.version)
    path = PERSONA_DIR / f"{name}.md"
    if not path.is_file():
        raise FileNotFoundError(f"Persona '{name}' not found")
    return path.read_text().strip(), None


def prompt_hash(prompt: str) -> str:
    """Short fingerprint of the prompt text, so edited personas can be told apart in analytics."""
    return hashlib.sha256(prompt.encode()).hexdigest()[:8]


def list_personas() -> list[dict]:
    out = []
    for p in sorted(PERSONA_DIR.glob("*.md")):
        text = p.read_text().strip()
        out.append({"name": p.stem, "preview": text.split("\n")[0][:140], "hash": prompt_hash(text)})
    return out
