import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import db as dbmod
from app.db import Base, get_db
from app.main import app
from app.voice_client import VoiceError, get_voice


class FakeVoice:
    def __init__(self):
        self.started, self.stopped, self.fail = [], [], None

    async def start(self, session_id, body):
        if self.fail:
            raise VoiceError(self.fail)
        self.started.append((session_id, body))
        return {"prompt_version": None, "prompt_hash": "abc12345"}

    async def personas(self):
        return [{"name": "default", "preview": "You are a friendly voice assistant", "hash": "abc12345"}]

    async def stop(self, session_id):
        self.stopped.append(session_id)


@pytest.fixture
async def voice():
    return FakeVoice()


@pytest.fixture
async def client(voice):
    engine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_voice] = lambda: voice
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()
