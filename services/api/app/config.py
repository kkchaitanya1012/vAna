from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./vana.db"
    voice_url: str = "http://localhost:8100"  # API -> voice server (internal)
    public_voice_url: str = "http://localhost:8100"  # browser -> voice server
    web_origin: str = "http://localhost:3000"
    audio_dir: str = str(ROOT / "data" / "audio")  # local storage; swap for S3/MinIO behind app/storage.py
    max_audio_mb: int = 200
    internal_token: str = Field("", validation_alias="VANA_INTERNAL_TOKEN")  # shared with the voice server; empty = no check (local dev)
    extensions: str = Field("", validation_alias="VANA_EXTENSIONS")  # comma-separated module names, each with setup(app); empty = none


settings = Settings()
