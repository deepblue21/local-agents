from __future__ import annotations

import secrets


PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PAIRING_GROUPS = 6
PAIRING_GROUP_SIZE = 4


def random_pairing_code() -> str:
    raw = "".join(
        secrets.choice(PAIRING_ALPHABET)
        for _ in range(PAIRING_GROUPS * PAIRING_GROUP_SIZE)
    )
    return "-".join(
        raw[index : index + PAIRING_GROUP_SIZE]
        for index in range(0, len(raw), PAIRING_GROUP_SIZE)
    )


def normalize_pairing_code(value: str) -> str:
    return "".join(char for char in value.upper() if char.isalnum())
