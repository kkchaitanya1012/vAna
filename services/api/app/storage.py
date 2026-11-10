"""Audio storage. Local disk today; the same two functions can front S3 or MinIO later."""

import uuid
import wave
from pathlib import Path

from app.config import settings


def audio_key(session_id: uuid.UUID) -> str:
    return f"sessions/{session_id}/session.wav"


def audio_path(session_id: uuid.UUID) -> Path:
    # Built from the UUID only, never from user input, so no path traversal.
    return Path(settings.audio_dir) / f"{session_id}.wav"


def audio_duration_ms(session_id: uuid.UUID) -> float | None:
    p = audio_path(session_id)
    if not p.is_file():
        return None
    try:
        with wave.open(str(p), "rb") as w:
            rate = w.getframerate()
            return w.getnframes() / rate * 1000 if rate else None  # a header can claim 0
    except (wave.Error, EOFError):
        return None
