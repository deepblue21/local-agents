"""Settings router — model params, system config, advanced."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..db import all_settings, get_conn, set_setting

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _grouped() -> dict:
    """Reshape flat dotted-key store into the nested shape the UI uses."""
    flat = all_settings()
    out: dict = {}
    for k, v in flat.items():
        if "." not in k:
            out[k] = v
            continue
        head, tail = k.split(".", 1)
        out.setdefault(head, {})[tail] = v
    return out


@router.get("")
def get_settings_route() -> dict:
    return _grouped()


class SettingsPatch(BaseModel):
    params: dict | None = None
    system: dict | None = None
    advanced: dict | None = None
    theme: str | None = None


@router.patch("")
def patch_settings(body: SettingsPatch) -> dict:
    for group_name in ("params", "system", "advanced"):
        group = getattr(body, group_name)
        if group:
            for k, v in group.items():
                set_setting(f"{group_name}.{k}", v)
    if body.theme is not None:
        set_setting("theme", body.theme)
    return _grouped()
