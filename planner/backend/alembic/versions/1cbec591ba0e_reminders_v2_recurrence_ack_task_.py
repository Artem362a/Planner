"""reminders v2: recurrence, ack, task reminders, user settings

Revision ID: 1cbec591ba0e
Revises: 3907d6d53071
Create Date: 2026-07-14 20:16:12.622485

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1cbec591ba0e'
down_revision: Union[str, Sequence[str], None] = '3907d6d53071'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # notifications.reminders: повторяемость, ответы, связь с задачей дня
    op.add_column(
        "reminders",
        sa.Column("kind", sa.String(), server_default="manual", nullable=False),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("source_task_id", sa.Integer(), nullable=True),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("recur_every", sa.Integer(), nullable=True),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("recur_unit", sa.String(), nullable=True),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("ack", sa.String(), nullable=True),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("ack_at", sa.DateTime(), nullable=True),
        schema="notifications",
    )
    op.add_column(
        "reminders",
        sa.Column("repeat_count", sa.Integer(), server_default="0", nullable=False),
        schema="notifications",
    )
    op.create_index(
        op.f("ix_notifications_reminders_source_task_id"),
        "reminders",
        ["source_task_id"],
        unique=True,
        schema="notifications",
    )
    op.create_foreign_key(
        "reminders_source_task_id_fkey",
        "reminders",
        "day_tasks",
        ["source_task_id"],
        ["id"],
        source_schema="notifications",
        referent_schema="planning",
        ondelete="CASCADE",
    )

    # planning.day_tasks: чекбокс «напомнить за N минут»
    op.add_column(
        "day_tasks",
        sa.Column("remind_lead_min", sa.Integer(), nullable=True),
        schema="planning",
    )

    # auth.users: настройки напоминаний
    op.add_column(
        "users",
        sa.Column("task_reminder_lead_min", sa.Integer(), server_default="10", nullable=False),
        schema="auth",
    )
    op.add_column(
        "users",
        sa.Column("reminder_repeat_min", sa.Integer(), server_default="30", nullable=False),
        schema="auth",
    )
    op.add_column(
        "users",
        sa.Column("reminder_repeat_max", sa.Integer(), server_default="3", nullable=False),
        schema="auth",
    )
    op.add_column(
        "users",
        sa.Column("goal_deadline_days", sa.Integer(), server_default="3", nullable=False),
        schema="auth",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "goal_deadline_days", schema="auth")
    op.drop_column("users", "reminder_repeat_max", schema="auth")
    op.drop_column("users", "reminder_repeat_min", schema="auth")
    op.drop_column("users", "task_reminder_lead_min", schema="auth")

    op.drop_column("day_tasks", "remind_lead_min", schema="planning")

    op.drop_constraint(
        "reminders_source_task_id_fkey",
        "reminders",
        schema="notifications",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_notifications_reminders_source_task_id"),
        table_name="reminders",
        schema="notifications",
    )
    op.drop_column("reminders", "repeat_count", schema="notifications")
    op.drop_column("reminders", "ack_at", schema="notifications")
    op.drop_column("reminders", "ack", schema="notifications")
    op.drop_column("reminders", "recur_unit", schema="notifications")
    op.drop_column("reminders", "recur_every", schema="notifications")
    op.drop_column("reminders", "source_task_id", schema="notifications")
    op.drop_column("reminders", "kind", schema="notifications")


