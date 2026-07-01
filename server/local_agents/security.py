from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from .config import Settings
from .database import Database
from .models import TokenBundle


def random_token() -> str:
    return secrets.token_urlsafe(48)


def issue_tokens(db: Database, settings: Settings, device_id: str) -> TokenBundle:
    now = datetime.now(UTC)
    access = random_token()
    refresh = random_token()
    access_expiry = now + timedelta(minutes=settings.access_token_minutes)
    refresh_expiry = now + timedelta(days=settings.refresh_token_days)
    db.store_token(access, device_id, "access", access_expiry)
    db.store_token(refresh, device_id, "refresh", refresh_expiry)
    return TokenBundle(
        access_token=access,
        refresh_token=refresh,
        expires_in=int((access_expiry - now).total_seconds()),
        device_id=device_id,
    )
