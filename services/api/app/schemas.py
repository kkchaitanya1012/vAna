import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class SttConfig(BaseModel):
    provider: str = "deepgram"
    model: str | None = None


class LlmConfig(BaseModel):
    provider: str = "openrouter"
    model: str = "meta-llama/llama-3.3-70b-instruct"


class TtsConfig(BaseModel):
    provider: str = "cartesia"
    voice: str | None = None


class SessionCreate(BaseModel):
    persona: str = Field("default", pattern=r"^[A-Za-z0-9_-]{1,64}$")
    stt: SttConfig = SttConfig()
    llm: LlmConfig = LlmConfig()
    tts: TtsConfig = TtsConfig()


class SessionCreated(BaseModel):
    session_id: uuid.UUID
    transport: str = "smallwebrtc"
    offer_url: str


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    started_at: datetime | None
    ended_at: datetime | None
    persona_name: str
    prompt_version: int | None
    prompt_hash: str | None
    stt_provider: str
    stt_model: str | None
    llm_provider: str
    llm_model: str | None
    tts_provider: str
    tts_voice: str | None
    audio_key: str | None
    summary: dict[str, Any] | None
    error: str | None
    created_at: datetime

    @field_serializer("started_at", "ended_at", "created_at")
    def _utc(self, v: datetime | None):
        # SQLite drops tzinfo; every stored time is UTC.
        if v is None:
            return None
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()


class EventIn(BaseModel):
    seq: int
    type: str
    t_ms: float
    turn_idx: int | None = None
    payload: dict[str, Any] | None = None


class EventsIn(BaseModel):
    events: list[EventIn]


class TurnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idx: int
    user_text: str | None
    bot_text: str | None
    user_start_ms: float | None
    user_stop_ms: float | None
    turn_end_ms: float | None
    stt_final_ms: float | None
    llm_started_ms: float | None
    llm_first_token_ms: float | None
    tts_first_byte_ms: float | None
    bot_start_ms: float | None
    bot_stop_ms: float | None
    interrupted: bool
    tokens_in: int | None
    tokens_out: int | None
    tts_chars: int | None
    stages: dict[str, float | None] = {}


class AudioInfo(BaseModel):
    url: str
    offset_ms: float  # event time (ms since session start) at which the recording begins
    duration_ms: float


class SessionDetail(SessionOut):
    turns: list[TurnOut] = []
    audio: AudioInfo | None = None


class CompareItem(BaseModel):
    session: SessionOut
    v2v: list[float]  # voice-to-voice ms for each turn that has one
