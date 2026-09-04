"""add experimental MCP allowlist, OAuth grants and audit log

Revision ID: e4b7a2c91d10
Revises: d9217bc430af
Create Date: 2026-09-04 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4b7a2c91d10"
down_revision: Union[str, Sequence[str], None] = "d9217bc430af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mcp_allowlist",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["granted_by_user_id"], ["auth.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_allowlist_id", "mcp_allowlist", ["id"], schema="auth")
    op.create_index(
        "ix_auth_mcp_allowlist_user_id", "mcp_allowlist", ["user_id"],
        unique=True, schema="auth"
    )

    op.create_table(
        "mcp_oauth_clients",
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("client_name", sa.String(), nullable=False),
        sa.Column("redirect_uris", sa.JSON(), nullable=False),
        sa.Column("token_endpoint_auth_method", sa.String(), server_default="none", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("client_id"),
        schema="auth",
    )

    op.create_table(
        "mcp_oauth_authorization_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_hash", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("code_challenge", sa.String(), nullable=False),
        sa.Column("code_challenge_method", sa.String(), nullable=False),
        sa.Column("resource", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["auth.mcp_oauth_clients.client_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_oauth_authorization_requests_id", "mcp_oauth_authorization_requests", ["id"], schema="auth")
    op.create_index(
        "ix_auth_mcp_oauth_authorization_requests_request_hash",
        "mcp_oauth_authorization_requests", ["request_hash"], unique=True,
        schema="auth"
    )
    op.create_index("ix_auth_mcp_oauth_authorization_requests_client_id", "mcp_oauth_authorization_requests", ["client_id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_authorization_requests_expires_at", "mcp_oauth_authorization_requests", ["expires_at"], schema="auth")

    op.create_table(
        "mcp_oauth_authorization_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("code_challenge", sa.String(), nullable=False),
        sa.Column("resource", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["auth.mcp_oauth_clients.client_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_oauth_authorization_codes_id", "mcp_oauth_authorization_codes", ["id"], schema="auth")
    op.create_index(
        "ix_auth_mcp_oauth_authorization_codes_code_hash",
        "mcp_oauth_authorization_codes", ["code_hash"], unique=True,
        schema="auth"
    )
    op.create_index("ix_auth_mcp_oauth_authorization_codes_client_id", "mcp_oauth_authorization_codes", ["client_id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_authorization_codes_user_id", "mcp_oauth_authorization_codes", ["user_id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_authorization_codes_expires_at", "mcp_oauth_authorization_codes", ["expires_at"], schema="auth")

    op.create_table(
        "mcp_oauth_grants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("resource", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["auth.mcp_oauth_clients.client_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_oauth_grants_id", "mcp_oauth_grants", ["id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_grants_user_id", "mcp_oauth_grants", ["user_id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_grants_client_id", "mcp_oauth_grants", ["client_id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_grants_revoked_at", "mcp_oauth_grants", ["revoked_at"], schema="auth")

    op.create_table(
        "mcp_oauth_access_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("grant_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["grant_id"], ["auth.mcp_oauth_grants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_oauth_access_tokens_id", "mcp_oauth_access_tokens", ["id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_access_tokens_grant_id", "mcp_oauth_access_tokens", ["grant_id"], schema="auth")
    op.create_index(
        "ix_auth_mcp_oauth_access_tokens_token_hash",
        "mcp_oauth_access_tokens", ["token_hash"], unique=True,
        schema="auth"
    )
    op.create_index("ix_auth_mcp_oauth_access_tokens_expires_at", "mcp_oauth_access_tokens", ["expires_at"], schema="auth")

    op.create_table(
        "mcp_oauth_refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("grant_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("replaced_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["grant_id"], ["auth.mcp_oauth_grants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["auth.mcp_oauth_refresh_tokens.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_oauth_refresh_tokens_id", "mcp_oauth_refresh_tokens", ["id"], schema="auth")
    op.create_index("ix_auth_mcp_oauth_refresh_tokens_grant_id", "mcp_oauth_refresh_tokens", ["grant_id"], schema="auth")
    op.create_index(
        "ix_auth_mcp_oauth_refresh_tokens_token_hash",
        "mcp_oauth_refresh_tokens", ["token_hash"], unique=True,
        schema="auth"
    )
    op.create_index("ix_auth_mcp_oauth_refresh_tokens_expires_at", "mcp_oauth_refresh_tokens", ["expires_at"], schema="auth")

    op.create_table(
        "mcp_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("grant_id", sa.Integer(), nullable=True),
        sa.Column("tool_name", sa.String(), nullable=False),
        sa.Column("arguments", sa.JSON(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["grant_id"], ["auth.mcp_oauth_grants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="auth",
    )
    op.create_index("ix_auth_mcp_audit_log_id", "mcp_audit_log", ["id"], schema="auth")
    op.create_index("ix_auth_mcp_audit_log_user_id", "mcp_audit_log", ["user_id"], schema="auth")
    op.create_index("ix_auth_mcp_audit_log_grant_id", "mcp_audit_log", ["grant_id"], schema="auth")
    op.create_index("ix_auth_mcp_audit_log_tool_name", "mcp_audit_log", ["tool_name"], schema="auth")
    op.create_index("ix_auth_mcp_audit_log_created_at", "mcp_audit_log", ["created_at"], schema="auth")


def downgrade() -> None:
    op.drop_table("mcp_audit_log", schema="auth")
    op.drop_table("mcp_oauth_refresh_tokens", schema="auth")
    op.drop_table("mcp_oauth_access_tokens", schema="auth")
    op.drop_table("mcp_oauth_grants", schema="auth")
    op.drop_table("mcp_oauth_authorization_codes", schema="auth")
    op.drop_table("mcp_oauth_authorization_requests", schema="auth")
    op.drop_table("mcp_oauth_clients", schema="auth")
    op.drop_table("mcp_allowlist", schema="auth")
