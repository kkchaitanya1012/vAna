"""Optional extensions.

An extension is a module named in VANA_EXTENSIONS (comma separated) that exposes
`setup(app)`. Core knows nothing about what an extension does. It offers two seams:

- a request guard: `add_guard(fn)`, called before every route (fn may raise HTTPException);
- events: `on(name, fn)`; core calls `emit(name, **kwargs)` (today: "session_created").

With VANA_EXTENSIONS empty, nothing is imported and both seams do nothing.
"""

import importlib
import sys
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request

from app.config import ROOT, settings

Guard = Callable[[Request], Awaitable[None]]

_guards: list[Guard] = []
_hooks: dict[str, list[Callable[..., Awaitable[None]]]] = {}


def add_guard(fn: Guard) -> None:
    _guards.append(fn)


def on(event: str, fn: Callable[..., Awaitable[None]]) -> None:
    _hooks.setdefault(event, []).append(fn)


async def emit(event: str, **kwargs) -> None:
    for fn in _hooks.get(event, []):
        await fn(**kwargs)


async def guard(request: Request) -> None:
    for fn in _guards:
        await fn(request)


def _names() -> list[str]:
    return [n.strip() for n in settings.extensions.split(",") if n.strip()]


def _prepare() -> list[str]:
    names = _names()
    if names and str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    return names


def import_models() -> None:
    """For Alembic: import `<extension>.models` so its tables are in the metadata."""
    for name in _prepare():
        importlib.import_module(f"{name}.models")


def load(app: FastAPI) -> None:
    for name in _prepare():
        importlib.import_module(name).setup(app)
