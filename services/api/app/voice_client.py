import httpx

from app.config import settings


class VoiceError(Exception):
    pass


class VoiceClient:
    """Talks to the voice server's internal control endpoints."""

    async def start(self, session_id: str, body: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(f"{settings.voice_url}/start", json={"session_id": session_id, **body})
        except httpx.HTTPError as e:
            raise VoiceError(f"voice server unreachable: {e}") from e
        if r.status_code >= 400:
            raise VoiceError(r.json().get("detail", r.text) if r.headers.get("content-type", "").startswith("application/json") else r.text)
        return r.json()

    async def personas(self) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{settings.voice_url}/personas")
                r.raise_for_status()
                return r.json()
        except httpx.HTTPError as e:
            raise VoiceError(f"voice server unreachable: {e}") from e

    async def stop(self, session_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(f"{settings.voice_url}/stop", json={"session_id": session_id})
        except httpx.HTTPError:
            pass  # session is ending anyway


voice = VoiceClient()


def get_voice() -> VoiceClient:
    return voice
