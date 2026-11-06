import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

Json = JSON().with_variant(JSONB, "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String, nullable=False)  # starting|live|processing|complete|failed
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    persona_name: Mapped[str] = mapped_column(String, nullable=False)
    prompt_version: Mapped[int | None] = mapped_column(Integer)
    prompt_hash: Mapped[str | None] = mapped_column(String)  # fingerprint of the prompt text, for file personas
    stt_provider: Mapped[str] = mapped_column(String, nullable=False)
    stt_model: Mapped[str | None] = mapped_column(String)
    llm_provider: Mapped[str] = mapped_column(String, nullable=False)
    llm_model: Mapped[str | None] = mapped_column(String)
    tts_provider: Mapped[str] = mapped_column(String, nullable=False)
    tts_voice: Mapped[str | None] = mapped_column(String)
    audio_key: Mapped[str | None] = mapped_column(String)
    summary: Mapped[dict | None] = mapped_column(Json)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Event(Base):
    __tablename__ = "events"

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    t_ms: Mapped[float] = mapped_column(Float, nullable=False)
    turn_idx: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict | None] = mapped_column(Json)


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("session_id", "idx"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    user_text: Mapped[str | None] = mapped_column(Text)
    bot_text: Mapped[str | None] = mapped_column(Text)
    # All times are ms since session start on the voice server's monotonic clock.
    user_start_ms: Mapped[float | None] = mapped_column(Float)
    user_stop_ms: Mapped[float | None] = mapped_column(Float)  # real end of speech (VAD stop minus stop_secs)
    turn_end_ms: Mapped[float | None] = mapped_column(Float)
    stt_final_ms: Mapped[float | None] = mapped_column(Float)
    llm_started_ms: Mapped[float | None] = mapped_column(Float)
    llm_first_token_ms: Mapped[float | None] = mapped_column(Float)
    tts_first_byte_ms: Mapped[float | None] = mapped_column(Float)
    bot_start_ms: Mapped[float | None] = mapped_column(Float)
    bot_stop_ms: Mapped[float | None] = mapped_column(Float)
    interrupted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    tts_chars: Mapped[int | None] = mapped_column(Integer)
    langfuse_trace_id: Mapped[str | None] = mapped_column(String)
