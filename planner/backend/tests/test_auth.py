"""Tests for /auth/* endpoints."""
from __future__ import annotations


class TestRegister:
    def test_register_returns_token(self, client):
        r = client.post(
            "/auth/register",
            json={"email": "new@test.com", "username": "new", "password": "pass1234"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    def test_register_creates_default_categories(self, client, db):
        from db import TaskCategory, User
        client.post(
            "/auth/register",
            json={"email": "cat@test.com", "username": "cat", "password": "pass1234"},
        )
        user = db.query(User).filter(User.email == "cat@test.com").first()
        assert user is not None
        cats = db.query(TaskCategory).filter(TaskCategory.user_id == user.id).count()
        assert cats > 0

    def test_register_rejects_duplicate_email(self, client, user):
        r = client.post(
            "/auth/register",
            json={"email": user.email, "username": "another", "password": "pass1234"},
        )
        assert r.status_code == 400
        assert "Email" in r.json()["detail"]

    def test_register_rejects_duplicate_username(self, client, user):
        r = client.post(
            "/auth/register",
            json={"email": "x@test.com", "username": user.username, "password": "pass1234"},
        )
        assert r.status_code == 400
        assert "Username" in r.json()["detail"]

    def test_register_rejects_empty_email(self, client):
        r = client.post(
            "/auth/register",
            json={"email": "   ", "username": "u", "password": "p"},
        )
        assert r.status_code == 400

    def test_register_normalizes_email_to_lowercase(self, client, db):
        from db import User
        client.post(
            "/auth/register",
            json={"email": "UPPER@TEST.COM", "username": "upper", "password": "pass1234"},
        )
        assert db.query(User).filter(User.email == "upper@test.com").first() is not None


class TestLogin:
    def test_login_success(self, client, user):
        r = client.post(
            "/auth/login",
            json={"email": user.email, "password": "password123"},
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, client, user):
        r = client.post(
            "/auth/login",
            json={"email": user.email, "password": "wrong"},
        )
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post(
            "/auth/login",
            json={"email": "nobody@test.com", "password": "any"},
        )
        assert r.status_code == 401

    def test_login_creates_session_row(self, client, db, user):
        from db import UserSession
        before = db.query(UserSession).filter(UserSession.user_id == user.id).count()
        client.post("/auth/login", json={"email": user.email, "password": "password123"})
        after = db.query(UserSession).filter(UserSession.user_id == user.id).count()
        assert after == before + 1


class TestMe:
    def test_me_returns_current_user(self, client, user, auth_headers):
        r = client.get("/auth/me", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == user.email
        assert body["username"] == user.username
        assert body["role"] == "user"

    def test_me_rejects_no_token(self, client):
        r = client.get("/auth/me")
        assert r.status_code in (401, 403)  # HTTPBearer rejects with one of these

    def test_me_rejects_bad_token(self, client):
        r = client.get("/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
        assert r.status_code == 401

    def test_me_rejects_revoked_session(self, client, db, user, auth_headers):
        # Wipe sessions => the bearer token's jti is no longer valid.
        from db import UserSession
        db.query(UserSession).filter(UserSession.user_id == user.id).delete()
        db.commit()
        r = client.get("/auth/me", headers=auth_headers)
        assert r.status_code == 401


class TestPasswordUpdate:
    def test_password_update_success(self, client, user, auth_headers):
        r = client.patch(
            "/auth/password",
            headers=auth_headers,
            json={"current_password": "password123", "new_password": "newpass99"},
        )
        assert r.status_code == 200

        # Old password should no longer work.
        assert client.post(
            "/auth/login",
            json={"email": user.email, "password": "password123"},
        ).status_code == 401

        # New password should work.
        assert client.post(
            "/auth/login",
            json={"email": user.email, "password": "newpass99"},
        ).status_code == 200

    def test_password_update_wrong_current(self, client, auth_headers):
        r = client.patch(
            "/auth/password",
            headers=auth_headers,
            json={"current_password": "wrong", "new_password": "newpass99"},
        )
        assert r.status_code == 400

    def test_password_update_too_short(self, client, auth_headers):
        r = client.patch(
            "/auth/password",
            headers=auth_headers,
            json={"current_password": "password123", "new_password": "abc"},
        )
        assert r.status_code == 400


class TestProfileUpdate:
    def test_change_username(self, client, auth_headers):
        r = client.patch(
            "/auth/profile",
            headers=auth_headers,
            json={"username": "renamed"},
        )
        assert r.status_code == 200
        assert r.json()["username"] == "renamed"

    def test_change_username_too_short(self, client, auth_headers):
        r = client.patch(
            "/auth/profile",
            headers=auth_headers,
            json={"username": "a"},
        )
        assert r.status_code == 400

    def test_change_username_already_taken(self, client, auth_headers, other_user):
        r = client.patch(
            "/auth/profile",
            headers=auth_headers,
            json={"username": other_user.username},
        )
        assert r.status_code == 400


class TestThemeAndDayStart:
    def test_set_dark_theme(self, client, auth_headers):
        r = client.patch("/auth/theme", headers=auth_headers, json={"theme": "dark"})
        assert r.status_code == 200
        assert r.json()["theme"] == "dark"

    def test_set_day_start_time(self, client, auth_headers):
        r = client.patch(
            "/auth/day-start",
            headers=auth_headers,
            json={"default_day_start_time": "07:30"},
        )
        assert r.status_code == 200
        assert r.json()["default_day_start_time"] == "07:30"

    def test_set_day_start_bad_format(self, client, auth_headers):
        r = client.patch(
            "/auth/day-start",
            headers=auth_headers,
            json={"default_day_start_time": "bad"},
        )
        assert r.status_code == 400


class TestVerifyEmail:
    def test_verify_email_with_valid_token(self, client, db):
        from db import User
        from auth import hash_password
        u = User(
            email="unv@test.com",
            username="unv",
            password_hash=hash_password("x"),
            email_verified=False,
            verification_token="tok123",
        )
        db.add(u)
        db.commit()

        r = client.get("/auth/verify-email", params={"token": "tok123"})
        assert r.status_code == 200

        db.refresh(u)
        assert u.email_verified is True
        assert u.verification_token is None

    def test_verify_email_bad_token(self, client):
        r = client.get("/auth/verify-email", params={"token": "nope"})
        assert r.status_code == 400


class TestSessions:
    def test_list_sessions_marks_current(self, client, auth_headers):
        r = client.get("/auth/sessions", headers=auth_headers)
        assert r.status_code == 200
        sessions = r.json()
        assert len(sessions) == 1
        assert sessions[0]["is_current"] is True

    def test_revoke_other_sessions_keeps_current(self, client, db, user, auth_headers):
        from db import UserSession
        db.add(UserSession(user_id=user.id, jti="extra-jti"))
        db.commit()
        assert db.query(UserSession).filter(UserSession.user_id == user.id).count() == 2

        r = client.delete("/auth/sessions", headers=auth_headers)
        assert r.status_code == 200

        remaining = db.query(UserSession).filter(UserSession.user_id == user.id).count()
        assert remaining == 1  # Current session not deleted.


class TestAccountDelete:
    def test_delete_account_wipes_user_data(self, client, db, user, auth_headers):
        from db import DayTask, User
        from datetime import date

        # Capture id now — the ORM instance becomes stale after the DELETE.
        uid = user.id

        db.add(DayTask(user_id=uid, day=date.today(), title="t", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.request(
            "DELETE",
            "/auth/account",
            headers=auth_headers,
            json={"password": "password123"},
        )
        assert r.status_code == 200
        assert db.query(User).filter(User.id == uid).first() is None
        assert db.query(DayTask).filter(DayTask.user_id == uid).count() == 0

    def test_delete_account_wrong_password(self, client, auth_headers):
        r = client.request(
            "DELETE",
            "/auth/account",
            headers=auth_headers,
            json={"password": "wrong"},
        )
        assert r.status_code == 400
