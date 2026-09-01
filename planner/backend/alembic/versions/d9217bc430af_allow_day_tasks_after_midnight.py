"""allow day tasks and reminder anchors after midnight

Revision ID: d9217bc430af
Revises: a7c4d9e21b60
Create Date: 2026-09-01 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9217bc430af"
down_revision: Union[str, Sequence[str], None] = "a7c4d9e21b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "day_tasks",
        sa.Column("start_day_offset", sa.Integer(), server_default="0", nullable=False),
        schema="planning",
    )
    op.add_column(
        "day_tasks",
        sa.Column(
            "remind_anchor_day_offset",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_column("day_tasks", "remind_anchor_day_offset", schema="planning")
    op.drop_column("day_tasks", "start_day_offset", schema="planning")
