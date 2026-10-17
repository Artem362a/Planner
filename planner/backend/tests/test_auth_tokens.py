"""Keep existing HS256 sessions valid when replacing the JWT implementation."""
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest

from auth import SECRET_KEY, create_access_token, decode_access_token
from db import UserSession


def base64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def legacy_token(user_id, *, expired=False, algorithm="HS256", key=SECRET_KEY):
    # The pre-migration JOSE format, signed independently of either JWT library.
    header = base64url(json.dumps({"alg": algorithm, "typ": "JWT"}, separators=(",", ":")).encode())
    claims = {
        "sub": str(user_id), "jti": "legacy-session",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=-1 if expired else 1)).timestamp()),
    }
    payload = base64url(json.dumps(claims, separators=(",", ":")).encode())
    message = f"{header}.{payload}"
    signature = base64url(hmac.new(key.encode(), message.encode(), hashlib.sha256).digest())
    return f"{message}.{signature}"


def test_existing_hs256_session_still_authenticates(client, db, user):
    db.add(UserSession(user_id=user.id, jti="legacy-session"))
    db.commit()
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {legacy_token(user.id)}"})
    assert response.status_code == 200
    assert response.json()["id"] == user.id


def test_new_tokens_keep_legacy_hs256_format_and_session_id():
    token, session_id = create_access_token({"sub": "123"})
    header, payload, signature = token.split(".")
    assert json.loads(base64.urlsafe_b64decode(header + "=" * (-len(header) % 4)))["alg"] == "HS256"
    expected = base64url(hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    assert hmac.compare_digest(signature, expected)
    decoded = decode_access_token(token)
    assert decoded["sub"] == "123" and decoded["jti"] == session_id


@pytest.mark.parametrize("token", [
    "not.a.token",
    legacy_token(123, expired=True),
    legacy_token(123, key="a-different-test-key"),
    legacy_token(123, algorithm="HS512"),
    legacy_token(123, algorithm="none"),
])
def test_invalid_or_disallowed_tokens_are_rejected(token):
    assert decode_access_token(token) is None
