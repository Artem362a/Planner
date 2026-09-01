"""add SSAU schedule subscriptions, events and day-task sync metadata

Revision ID: a7c4d9e21b60
Revises: 3caef5c05ac1
Create Date: 2026-09-01 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4d9e21b60"
down_revision: Union[str, Sequence[str], None] = "3caef5c05ac1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schedule_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("feed_url", sa.Text(), nullable=False),
        sa.Column("subgroup", sa.String(), server_default="all", nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_content_hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_schedule_subscriptions_user_id"),
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_subscriptions_id",
        "schedule_subscriptions",
        ["id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_subscriptions_user_id",
        "schedule_subscriptions",
        ["user_id"],
        schema="planning",
    )

    op.create_table(
        "schedule_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("event_key", sa.String(), nullable=False),
        sa.Column("event_hash", sa.String(), nullable=False),
        sa.Column("uid", sa.Text(), nullable=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("teacher", sa.Text(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("lesson_type", sa.String(), server_default="other", nullable=False),
        sa.Column("subgroup", sa.String(), nullable=True),
        sa.Column("conference_url", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["planning.schedule_subscriptions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "subscription_id",
            "event_key",
            name="uq_schedule_events_subscription_key",
        ),
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_events_id",
        "schedule_events",
        ["id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_events_subscription_id",
        "schedule_events",
        ["subscription_id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_events_day",
        "schedule_events",
        ["day"],
        schema="planning",
    )

    op.create_table(
        "schedule_sync_alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("telegram_sent_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_sync_alerts_id",
        "schedule_sync_alerts",
        ["id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_sync_alerts_user_id",
        "schedule_sync_alerts",
        ["user_id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_sync_alerts_created_at",
        "schedule_sync_alerts",
        ["created_at"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_schedule_sync_alerts_telegram_sent_at",
        "schedule_sync_alerts",
        ["telegram_sent_at"],
        schema="planning",
    )

    op.add_column(
        "day_settings",
        sa.Column("plan_locked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        schema="planning",
    )
    op.add_column(
        "day_tasks",
        sa.Column("schedule_subscription_id", sa.Integer(), nullable=True),
        schema="planning",
    )
    op.add_column(
        "day_tasks",
        sa.Column("schedule_event_key", sa.String(), nullable=True),
        schema="planning",
    )
    op.add_column(
        "day_tasks",
        sa.Column("schedule_lesson_type", sa.String(), nullable=True),
        schema="planning",
    )
    op.create_foreign_key(
        "fk_day_tasks_schedule_subscription_id",
        "day_tasks",
        "schedule_subscriptions",
        ["schedule_subscription_id"],
        ["id"],
        source_schema="planning",
        referent_schema="planning",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_planning_day_tasks_schedule_subscription_id",
        "day_tasks",
        ["schedule_subscription_id"],
        schema="planning",
    )
    op.create_index(
        "ix_planning_day_tasks_schedule_event_key",
        "day_tasks",
        ["schedule_event_key"],
        schema="planning",
    )


def downgrade() -> None:
    op.drop_index("ix_planning_day_tasks_schedule_event_key", table_name="day_tasks", schema="planning")
    op.drop_index("ix_planning_day_tasks_schedule_subscription_id", table_name="day_tasks", schema="planning")
    op.drop_constraint(
        "fk_day_tasks_schedule_subscription_id",
        "day_tasks",
        schema="planning",
        type_="foreignkey",
    )
    op.drop_column("day_tasks", "schedule_lesson_type", schema="planning")
    op.drop_column("day_tasks", "schedule_event_key", schema="planning")
    op.drop_column("day_tasks", "schedule_subscription_id", schema="planning")
    op.drop_column("day_settings", "plan_locked", schema="planning")

    op.drop_index(
        "ix_planning_schedule_sync_alerts_telegram_sent_at",
        table_name="schedule_sync_alerts",
        schema="planning",
    )
    op.drop_index(
        "ix_planning_schedule_sync_alerts_created_at",
        table_name="schedule_sync_alerts",
        schema="planning",
    )
    op.drop_index(
        "ix_planning_schedule_sync_alerts_user_id",
        table_name="schedule_sync_alerts",
        schema="planning",
    )
    op.drop_index(
        "ix_planning_schedule_sync_alerts_id",
        table_name="schedule_sync_alerts",
        schema="planning",
    )
    op.drop_table("schedule_sync_alerts", schema="planning")

    op.drop_index("ix_planning_schedule_events_day", table_name="schedule_events", schema="planning")
    op.drop_index(
        "ix_planning_schedule_events_subscription_id",
        table_name="schedule_events",
        schema="planning",
    )
    op.drop_index("ix_planning_schedule_events_id", table_name="schedule_events", schema="planning")
    op.drop_table("schedule_events", schema="planning")

    op.drop_index(
        "ix_planning_schedule_subscriptions_user_id",
        table_name="schedule_subscriptions",
        schema="planning",
    )
    op.drop_index(
        "ix_planning_schedule_subscriptions_id",
        table_name="schedule_subscriptions",
        schema="planning",
    )
    op.drop_table("schedule_subscriptions", schema="planning")
