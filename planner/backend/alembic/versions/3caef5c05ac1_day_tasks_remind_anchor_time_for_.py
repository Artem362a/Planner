"""day_tasks remind_anchor_time for duration-mode reminders

Revision ID: 3caef5c05ac1
Revises: 1cbec591ba0e
Create Date: 2026-07-14 21:09:04.110492

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3caef5c05ac1'
down_revision: Union[str, Sequence[str], None] = '1cbec591ba0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "day_tasks",
        sa.Column("remind_anchor_time", sa.Time(), nullable=True),
        schema="planning",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("day_tasks", "remind_anchor_time", schema="planning")
