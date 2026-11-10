import hmac
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.config import settings
from app.db import get_db
from app import catalog, extensions, metrics, voices
from app.derive import finalize_session
from app.models import Event, Session, Turn, utcnow
from app.schemas import AudioInfo, CompareItem, EventsIn, SessionCreate, SessionCreated, SessionDetail, SessionOut, TurnOut
from app.voice_client import VoiceClient, VoiceError, get_voice

app = FastAPI(title="vAna API", dependencies=[Depends(extensions.guard)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,  # lets an extension (for example a sign-in cookie) travel with browser calls
    allow_methods=["*"],
    allow_headers=["*"],
)
extensions.load(app)


async def require_internal(request: Request) -> None:
    """Calls only the voice server should make (events, audio upload). No-op when VANA_INTERNAL_TOKEN is unset."""
    token = settings.internal_token
    if token and not hmac.compare_digest(request.headers.get("x-internal-token", "").encode(), token.encode()):
        raise HTTPException(401, "internal token required")


@app.get("/providers")
async def providers():
    """What can be chosen for each step, and whether its key is set up. Never returns key values."""
    return catalog.public()


@app.get("/providers/tts/{provider}/voices")
async def tts_voices(provider: str):
    """Every voice for one provider. Cartesia and ElevenLabs come live from the vendor; others from the catalog."""
    try:
        return await voices.list_voices(provider)
    except KeyError:
        raise HTTPException(404, f"unknown voice provider '{provider}'")


@app.get("/personas")
async def personas(voice: VoiceClient = Depends(get_voice)):
    try:
        return await voice.personas()
    except VoiceError as e:
        raise HTTPException(502, f"Could not load personas: {e}")


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/sessions", response_model=SessionCreated, status_code=201)
async def create_session(
    body: SessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    voice: VoiceClient = Depends(get_voice),
):
    try:
        await voices.ensure_voice(body.tts.provider, body.tts.voice)
    except voices.VoiceUnavailable as e:
        raise HTTPException(422, str(e))
    s = Session(
        status="starting",
        persona_name=body.persona,
        stt_provider=body.stt.provider,
        stt_model=body.stt.model,
        llm_provider=body.llm.provider,
        llm_model=body.llm.model,
        tts_provider=body.tts.provider,
        tts_voice=body.tts.voice,
    )
    db.add(s)
    await db.commit()
    try:
        info = await voice.start(str(s.id), body.model_dump())
    except VoiceError as e:
        s.status, s.error, s.ended_at = "failed", str(e), utcnow()
        await db.commit()
        raise HTTPException(502, f"Could not start voice session: {e}")
    version = info.get("prompt_version")
    if version is not None and str(version).isdigit():
        s.prompt_version = int(version)
    s.prompt_hash = info.get("prompt_hash")
    await db.commit()
    await extensions.emit("session_created", request=request, db=db, session_id=s.id)
    return SessionCreated(session_id=s.id, offer_url=f"{settings.public_voice_url}/api/offer")


@app.post("/sessions/{session_id}/end", response_model=SessionOut, status_code=202)
async def end_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    voice: VoiceClient = Depends(get_voice),
):
    s = await db.get(Session, session_id)
    if s is None:
        raise HTTPException(404, "session not found")
    if s.status in ("starting", "live"):
        await voice.stop(str(s.id))
        s.status, s.ended_at = "complete", utcnow()
        await db.commit()
        await finalize_session(db, s)  # the voice server's session_closed re-runs this
    return s


@app.post("/sessions/{session_id}/events", status_code=204, dependencies=[Depends(require_internal)])
async def ingest_events(session_id: uuid.UUID, body: EventsIn, db: AsyncSession = Depends(get_db)):
    s = await db.get(Session, session_id)
    if s is None:
        raise HTTPException(404, "session not found")
    have = set(
        (await db.scalars(select(Event.seq).where(Event.session_id == session_id))).all()
    )
    for e in body.events:
        if e.seq in have:
            continue  # duplicate delivery
        have.add(e.seq)
        db.add(Event(session_id=session_id, seq=e.seq, type=e.type, t_ms=e.t_ms,
                     turn_idx=e.turn_idx, payload=e.payload))
        if e.type == "session_started" and s.status == "starting":
            s.status, s.started_at = "live", datetime.now(timezone.utc)
        elif e.type == "session_closed":
            if s.status in ("starting", "live"):
                s.status = "complete"
            s.ended_at = s.ended_at or utcnow()
            if e.payload and e.payload.get("audio_key"):
                s.audio_key = e.payload["audio_key"]
    await db.commit()
    if any(e.type == "session_closed" for e in body.events):
        await finalize_session(db, s)


@app.put("/sessions/{session_id}/audio", status_code=204, dependencies=[Depends(require_internal)])
async def upload_audio(session_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Raw WAV body from the voice server. Streamed to disk with a size cap."""
    s = await db.get(Session, session_id)
    if s is None:
        raise HTTPException(404, "session not found")
    path = storage.audio_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    limit, size = settings.max_audio_mb * 1024 * 1024, 0
    try:
        with tmp.open("wb") as f:
            async for chunk in request.stream():
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"audio larger than {settings.max_audio_mb} MB")
                f.write(chunk)
        if size < 44:
            raise HTTPException(400, "not a WAV file")
        tmp.replace(path)  # atomic: readers never see a half-written file
    finally:
        tmp.unlink(missing_ok=True)
    s.audio_key = storage.audio_key(session_id)
    await db.commit()


@app.get("/sessions/{session_id}/audio")
async def download_audio(session_id: uuid.UUID):
    path = storage.audio_path(session_id)
    if not path.is_file():
        raise HTTPException(404, "no recording for this session")
    return FileResponse(path, media_type="audio/wav")  # supports Range requests for seeking


@app.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    limit: int = 50,
    persona: str | None = None,
    provider: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """`provider` matches any of the three steps (speech to text, language model, voice)."""
    q = select(Session).order_by(Session.created_at.desc()).limit(min(limit, 200))
    if persona:
        q = q.where(Session.persona_name == persona)
    if provider:
        q = q.where(or_(Session.stt_provider == provider, Session.llm_provider == provider, Session.tts_provider == provider))
    return list(await db.scalars(q))


@app.get("/compare", response_model=list[CompareItem])
async def compare(ids: str, db: AsyncSession = Depends(get_db)):
    """2 to 4 sessions, in the order asked: summary plus each turn's voice-to-voice time."""
    try:
        wanted = list(dict.fromkeys(uuid.UUID(x) for x in ids.split(",") if x.strip()))
    except ValueError:
        raise HTTPException(422, "ids must be a comma-separated list of session ids")
    if not 2 <= len(wanted) <= 4:
        raise HTTPException(422, "compare 2 to 4 sessions")
    found = {s.id: s for s in await db.scalars(select(Session).where(Session.id.in_(wanted)))}
    if len(found) != len(wanted):
        raise HTTPException(404, "session not found")
    out = []
    for sid in wanted:
        rows = (await db.scalars(select(Turn).where(Turn.session_id == sid).order_by(Turn.idx))).all()
        v2v = [
            metrics.stage_metrics(metrics.TurnData(**{k: getattr(r, k) for k in metrics.TurnData.__dataclass_fields__}))["v2v"]
            for r in rows
        ]
        out.append(CompareItem(session=SessionOut.model_validate(found[sid]), v2v=[v for v in v2v if v is not None]))
    return out


@app.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    s = await db.get(Session, session_id)
    if s is None:
        raise HTTPException(404, "session not found")
    rows = (await db.scalars(select(Turn).where(Turn.session_id == session_id).order_by(Turn.idx))).all()
    turns = []
    for r in rows:
        out = TurnOut.model_validate(r)
        out.stages = metrics.stage_metrics(metrics.TurnData(**{k: getattr(r, k) for k in metrics.TurnData.__dataclass_fields__}))
        turns.append(out)
    detail = SessionDetail.model_validate(s)
    detail.turns = turns
    if s.audio_key and (dur := storage.audio_duration_ms(session_id)) is not None:
        started = await db.scalar(
            select(Event.t_ms).where(Event.session_id == session_id, Event.type == "recording_started").order_by(Event.seq).limit(1)
        )
        # Audio time = event time minus offset_ms. Falls back to 0 when the marker is missing.
        detail.audio = AudioInfo(url=f"/sessions/{session_id}/audio", offset_ms=started or 0.0, duration_ms=dur)
    return detail
