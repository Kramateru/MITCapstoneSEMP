"""
Helpers for normalizing environment values and validating third-party service config.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Optional
from urllib.parse import urlparse

SUPABASE_URL_ENV_KEYS = (
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "REACT_APP_SUPABASE_URL",
)
SUPABASE_PUBLISHABLE_KEY_ENV_KEYS = (
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "REACT_APP_ANON_KEY",
)
SUPABASE_SERVICE_KEY_ENV_KEYS = (
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SERVICE_ROLE",
)
GEMINI_API_KEY_ENV_KEYS = (
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
)

_PLACEHOLDER_VALUES = {
    "",
    "undefined",
    "null",
    "none",
    "your_key_here",
}
_PLACEHOLDER_PREFIXES = (
    "your_",
    "replace_",
    "example_",
    "changeme",
    "<",
)


def normalize_env_value(value: Optional[str]) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        return ""

    if (
        (trimmed.startswith('"') and trimmed.endswith('"'))
        or (trimmed.startswith("'") and trimmed.endswith("'"))
    ):
        trimmed = trimmed[1:-1].strip()

    if trimmed.lower() in _PLACEHOLDER_VALUES:
        return ""

    return trimmed


def resolve_first_configured_value(values: list[Optional[str]] | tuple[Optional[str], ...]) -> str:
    for value in values:
        normalized = normalize_env_value(value)
        if normalized:
            return normalized
    return ""


def resolve_supabase_url(value_provider) -> str:
    return resolve_first_configured_value([value_provider(key) for key in SUPABASE_URL_ENV_KEYS])


def resolve_supabase_publishable_key(value_provider) -> str:
    return resolve_first_configured_value(
        [value_provider(key) for key in SUPABASE_PUBLISHABLE_KEY_ENV_KEYS]
    )


def resolve_supabase_service_key(value_provider) -> str:
    return resolve_first_configured_value([value_provider(key) for key in SUPABASE_SERVICE_KEY_ENV_KEYS])


def resolve_gemini_api_key(value_provider) -> str:
    return resolve_first_configured_value([value_provider(key) for key in GEMINI_API_KEY_ENV_KEYS])


def is_placeholder_value(value: Optional[str]) -> bool:
    normalized = normalize_env_value(value)
    if not normalized:
        return True

    lowered = normalized.lower()
    return lowered in _PLACEHOLDER_VALUES or lowered.startswith(_PLACEHOLDER_PREFIXES)


def is_usable_azure_speech_key(value: Optional[str]) -> bool:
    normalized = normalize_env_value(value)
    if not normalized or is_placeholder_value(normalized):
        return False

    # Azure Speech keys are opaque, but real keys are substantially longer than placeholders.
    return len(normalized) >= 16


def is_usable_supabase_url(value: Optional[str]) -> bool:
    normalized = normalize_env_value(value)
    if not normalized or is_placeholder_value(normalized):
        return False

    try:
        parsed = urlparse(normalized)
    except Exception:
        return False

    return bool(parsed.scheme in {"http", "https"} and parsed.netloc)


def _decode_jwt_payload(token: str) -> Optional[dict[str, Any]]:
    parts = token.split(".")
    if len(parts) != 3:
        return None

    try:
        payload = parts[1]
        padding = "=" * ((4 - len(payload) % 4) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        return json.loads(decoded.decode("utf-8"))
    except Exception:
        return None


def extract_supabase_project_ref_from_key(value: Optional[str]) -> Optional[str]:
    normalized = normalize_env_value(value)
    if not normalized or is_placeholder_value(normalized):
        return None

    payload = _decode_jwt_payload(normalized)
    ref = payload.get("ref") if isinstance(payload, dict) else None
    return ref if isinstance(ref, str) and ref.strip() else None


def extract_supabase_project_ref_from_url(value: Optional[str]) -> Optional[str]:
    normalized = normalize_env_value(value)
    if not normalized or is_placeholder_value(normalized):
        return None

    try:
        parsed = urlparse(normalized)
    except Exception:
        return None

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return None

    return hostname.split(".")[0] or None


def supabase_key_matches_url(url: Optional[str], key: Optional[str]) -> bool:
    url_ref = extract_supabase_project_ref_from_url(url)
    key_ref = extract_supabase_project_ref_from_key(key)
    if not url_ref:
        return False
    if not key_ref:
        return True

    return url_ref == key_ref


def classify_supabase_api_key(value: Optional[str]) -> Optional[str]:
    normalized = normalize_env_value(value)
    if not normalized or is_placeholder_value(normalized):
        return None

    if normalized.startswith("sb_secret_"):
        return "sb_secret"

    if normalized.startswith("sb_publishable_"):
        return "sb_publishable"

    parts = normalized.split(".")
    if len(parts) != 3 or any(not part for part in parts):
        return None

    payload = _decode_jwt_payload(normalized)
    role = payload.get("role") if isinstance(payload, dict) else None
    if role == "service_role":
        return "service_role_jwt"
    if role == "anon":
        return "anon_jwt"

    return None


def is_usable_supabase_service_key(value: Optional[str]) -> bool:
    return classify_supabase_api_key(value) in {"sb_secret", "service_role_jwt"}


def is_usable_supabase_publishable_key(value: Optional[str]) -> bool:
    return classify_supabase_api_key(value) in {"sb_publishable", "anon_jwt"}
