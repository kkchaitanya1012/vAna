"""Voice server: internal control (/start, /stop) plus the browser's WebRTC offer endpoint.

Run:  .venv/bin/python server.py   (port 8100)
"""

import asyncio
import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=True)

from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from events import ApiEvents
from persona import list_personas, load_persona, prompt_hash
from session import SessionConfig, SessionHandle, run_session

API_URL = os.getenv("API_URL", "http://localhost:8000")
WEB_ORIGIN = os.getenv("WEB_ORIGIN", "http://localhost:3000")

app = FastAPI(title="vAna voice server")
app.add_middleware(CORSMiddleware, allow_origins=[WEB_ORIGIN], allow_methods=["*"], allow_headers=["*"])
webrtc = SmallWebRTCRequestHandler()

pending: dict[str, SessionConfig] = {}  # registered by /start, consumed by the first offer
running: dict[str, SessionHandle] = {}


class StartBody(BaseModel):
    session_id: str
    persona: str = "default"
    stt: dict = {"provider": "deepgram"}
    llm: dict = {"provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct"}
    tts: dict = {"provider": "cartesia"}


class StopBody(BaseModel):
    session_id: str


@app.post("/start", status_code=202)
async def start(body: StartBody):
    try:
        prompt, version = load_persona(body.persona)
        cfg = SessionConfig(body.session_id, body.persona, prompt, version, prompt_hash(prompt), body.stt, body.llm, body.tts)
        cfg.validate()
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(400, str(e))
    pending[body.session_id] = cfg
    return {"prompt_version": version, "prompt_hash": prompt_hash(prompt)}


@app.get("/personas")
async def personas():
    return list_personas()


@app.post("/stop", status_code=202)
async def stop(body: StopBody):
    pending.pop(body.session_id, None)
    handle = running.get(body.session_id)
    if handle and handle.task:
        await handle.task.cancel()
    return {"ok": True}


@app.post("/api/offer")
async def offer(http_request: Request):
    # The browser client sends camelCase `requestData`; from_dict maps it.
    request = SmallWebRTCRequest.from_dict(await http_request.json())
    data = request.request_data or {}
    session_id = data.get("session_id") if isinstance(data, dict) else None
    cfg = pending.get(session_id) if session_id else None
    if cfg is None and request.pc_id is None:
        raise HTTPException(404, "Unknown session. Call POST /sessions on the API first.")

    async def on_connection(connection):
        pending.pop(cfg.session_id, None)
        transport = SmallWebRTCTransport(
            webrtc_connection=connection,
            params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        )
        handle = SessionHandle()
        running[cfg.session_id] = handle

        async def go():
            try:
                await run_session(transport, cfg, ApiEvents(API_URL, cfg.session_id), handle)
            except Exception:
                logger.exception(f"[{cfg.session_id}] session crashed")
            finally:
                running.pop(cfg.session_id, None)

        asyncio.create_task(go())

    return await webrtc.handle_web_request(request=request, webrtc_connection_callback=on_connection)


@app.patch("/api/offer")
async def ice_candidate(request: SmallWebRTCPatchRequest):
    await webrtc.handle_patch_request(request)
    return {"status": "success"}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8100)
