"""Add opt-in daily successes."""
from alembic import op
import sqlalchemy as sa

revision = "f19c4a82b607"
down_revision = "e4b7a2c91d10"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("daily_successes_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")), schema="auth")
    op.create_table(
        "daily_successes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("planning.task_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema="planning",
    )
    op.create_index("ix_planning_daily_successes_user_id", "daily_successes", ["user_id"], schema="planning")
    op.create_index("ix_planning_daily_successes_day", "daily_successes", ["day"], schema="planning")


def downgrade():
    op.drop_table("daily_successes", schema="planning")
    op.drop_column("users", "daily_successes_enabled", schema="auth")
