"""Buffered event delivery to the API.

emit() is synchronous and never blocks the audio pipeline. A background task
flushes batches and retries with backoff. Delivery is at-least-once; the API
drops duplicate seq values.
"""

import asyncio
import time

import httpx
from loguru import logger

FLUSH_INTERVAL_S = 0.4
MAX_BATCH = 100


class ApiEvents:
    def __init__(self, api_url: str, session_id: str):
        self._url = f"{api_url}/sessions/{session_id}/events"
        self._audio_url = f"{api_url}/sessions/{session_id}/audio"
        self._seq = 0
        self._t0 = time.monotonic()
        self._buf: list[dict] = []
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(5, read=60, write=120))
        self._task: asyncio.Task | None = None
        self._stopping = False

    def t_ms(self) -> float:
        return (time.monotonic() - self._t0) * 1000

    def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    def emit(self, type_: str, payload: dict | None = None, turn_idx: int | None = None):
        self._seq += 1
        self._buf.append({"seq": self._seq, "type": type_, "t_ms": round(self.t_ms(), 1),
                          "turn_idx": turn_idx, "payload": payload})

    async def _send(self, batch: list[dict]) -> bool:
        try:
            r = await self._http.post(self._url, json={"events": batch})
            r.raise_for_status()
            return True
        except httpx.HTTPError as e:
            logger.warning(f"events not delivered ({len(batch)}): {e}")
            return False

    async def _flush_once(self) -> bool:
        if not self._buf:
            return True
        batch = self._buf[:MAX_BATCH]
        if await self._send(batch):
            del self._buf[: len(batch)]
            return True
        return False

    async def _loop(self):
        delay = FLUSH_INTERVAL_S
        while not self._stopping:
            await asyncio.sleep(delay)
            ok = await self._flush_once()
            delay = FLUSH_INTERVAL_S if ok else min(delay * 2, 4.0)

    async def upload_audio(self, wav: bytes) -> bool:
        for attempt in range(3):
            try:
                r = await self._http.put(self._audio_url, content=wav, headers={"content-type": "audio/wav"})
                r.raise_for_status()
                return True
            except httpx.HTTPError as e:
                logger.warning(f"audio upload failed (attempt {attempt + 1}): {e}")
                await asyncio.sleep(0.5 * (attempt + 1))
        logger.error("recording was not uploaded")
        return False

    async def close(self):
        """Stop the loop, then make a last effort to deliver everything buffered."""
        self._stopping = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        for attempt in range(4):
            while self._buf:
                if not await self._flush_once():
                    break
            if not self._buf:
                break
            await asyncio.sleep(0.5 * (attempt + 1))
        if self._buf:
            logger.error(f"{len(self._buf)} events were never delivered")
        await self._http.aclose()
