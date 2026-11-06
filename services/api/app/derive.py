import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cost, metrics
from app.models import Event, Session, Turn


async def finalize_session(db: AsyncSession, session: Session) -> None:
    """Rebuild turns and summary from stored events. Idempotent: safe to run more than once."""
    rows = (await db.scalars(select(Event).where(Event.session_id == session.id))).all()
    raw = [metrics.RawEvent(e.seq, e.type, e.t_ms, e.turn_idx, e.payload) for e in rows]
    turns = metrics.derive_turns(raw)
    await db.execute(delete(Turn).where(Turn.session_id == session.id))
    for t in turns:
        db.add(Turn(id=uuid.uuid4(), session_id=session.id, **{k: v for k, v in t.__dict__.items()}))
    summary = metrics.summarize(turns)
    closed = [e.t_ms for e in rows if e.type == "session_closed"]
    duration_ms = max(closed) if closed else max((e.t_ms for e in rows), default=None)
    summary["duration_ms"] = round(duration_ms) if duration_ms else None
    summary["cost_usd"] = cost.estimate(session, summary["tokens_in"], summary["tokens_out"], summary["tts_chars"], duration_ms)
    session.summary = summary
    await db.commit()
