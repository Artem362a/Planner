import enum
import os
from datetime import date, datetime, time

from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Time,
    create_engine,
)
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship, sessionmaker
from sqlalchemy.sql import func

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL, echo=False)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

# Domain schemas. Kept in one place so `main.py` and the migration script
# both reference the same source of truth.
SCHEMAS = ("auth", "planning", "goals", "notifications", "feedback")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "notifications"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("auth.users.id"),
        nullable=True,
        index=True,
    )

    audience_type: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="single",  # single | group | all
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    recipients: Mapped[list["NotificationRecipient"]] = relationship(
        "NotificationRecipient",
        back_populates="notification",
        cascade="all, delete-orphan",
    )

class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"
    __table_args__ = {"schema": "notifications"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.notifications.id"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth.users.id"),
        nullable=False,
        index=True,
    )

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    notification: Mapped["Notification"] = relationship(
        "Notification",
        back_populates="recipients",
    )

class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = {"schema": "goals"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth.users.id"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String, nullable=False, default="#7ECF8A")
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    goal_type: Mapped[str] = mapped_column(String, nullable=False, default="one_time")
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repeat_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    has_stages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    schedule_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    category_key: Mapped[str | None] = mapped_column(String, nullable=True)
    is_focus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    stages: Mapped[list["GoalStage"]] = relationship(
        "GoalStage",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalStage.order_index",
    )

class GoalStage(Base):
    __tablename__ = "goal_stages"
    __table_args__ = {"schema": "goals"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.goals.id"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    goal: Mapped["Goal"] = relationship("Goal", back_populates="stages")

class GoalCheckin(Base):
    __tablename__ = "goal_checkins"
    __table_args__ = {"schema": "goals"}

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.goals.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    check_date = Column(Date, nullable=False, index=True)
    done = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)

    email_verified = Column(Boolean, nullable=False, default=False)
    verification_token = Column(String, unique=True, nullable=True, index=True)
    role = Column(String, nullable=False, default="user")
    avatar = Column(Text, nullable=True)

    # 'light' | 'dark' ('dark' is currently in development).
    theme = Column(String, nullable=False, default="light")
    # Default start_time used when a new DaySettings row is created.
    default_day_start_time = Column(Time, nullable=False, default=time(6, 0))


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    # Unique JWT id (jti claim). Logout = delete the row.
    jti = Column(String, unique=True, nullable=False, index=True)

    user_agent = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class TelegramLink(Base):
    """Связь пользователя с Telegram-чатом + одноразовый код привязки."""

    __tablename__ = "telegram_links"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("auth.users.id"), nullable=False, unique=True, index=True
    )
    # Telegram chat id. Заполняется после успешной привязки.
    chat_id = Column(String, unique=True, nullable=True, index=True)

    # Одноразовый код привязки (показывается в вебе, вводится в боте).
    link_code = Column(String, nullable=True, index=True)
    link_code_expires = Column(DateTime, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    linked_at = Column(DateTime, nullable=True)


class FeedbackMessage(Base):
    __tablename__ = "feedback_messages"
    __table_args__ = {"schema": "feedback"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=True, index=True)

    category = Column(String, nullable=False)
    feedback_type = Column(String, nullable=False)

    name = Column(String, nullable=True)
    contact = Column(String, nullable=True)
    message = Column(Text, nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String, nullable=False, default="new")

    developer_reply = Column(Text, nullable=True)
    developer_replied_at = Column(DateTime, nullable=True)
    screenshots = Column(JSON, nullable=True)


class TaskCategory(Base):
    __tablename__ = "task_categories"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    key = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#BBBBBB")
    icon = Column(String, nullable=False, default="tag")


class DayTemplate(Base):
    __tablename__ = "day_templates"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#f0e7ff")
    tasks_json = Column(JSON, nullable=False)
    # Время начала дня, которое применится при импорте шаблона ("HH:MM"|null).
    day_start = Column(String, nullable=True)


class WeekTemplate(Base):
    __tablename__ = "week_templates"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#f0e7ff")
    tasks_json = Column(JSON, nullable=False)


class TaskPriority(str, enum.Enum):
    high = "high"
    medium = "medium"


class DayTask(Base):
    __tablename__ = "day_tasks"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    day = Column(Date, index=True)

    title = Column(String, nullable=False)
    start_time = Column(Time, nullable=True)
    duration_min = Column(Integer, nullable=True)

    priority = Column(String, default="medium")
    category = Column(String, nullable=True)
    status = Column(Integer, default=0)

    subtasks = Column(JSON, nullable=True)
    order_index = Column(Integer, nullable=False, default=0, index=True)
    source_week_task_id = Column(Integer, ForeignKey("planning.week_tasks.id"), nullable=True, index=True)
    source_inbox_task_id = Column(Integer, ForeignKey("planning.inbox_tasks.id"), nullable=True, index=True)
    dismissed = Column(Boolean, default=False, nullable=False)


class DayNote(Base):
    __tablename__ = "day_notes"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)
    day = Column(Date, nullable=False, index=True)
    text = Column(Text, nullable=False, default="")


class DaySettings(Base):
    __tablename__ = "day_settings"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    day = Column(Date, index=True)
    start_time = Column(Time, nullable=False, default=time(6, 0))


class WeekTask(Base):
    __tablename__ = "week_tasks"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    category = Column(String, nullable=True)
    important = Column(Boolean, default=False)
    status = Column(Integer, default=0)
    subtasks = Column(JSON, nullable=True)
    order_index = Column(Integer, default=0, nullable=False)

    task_type = Column(String, default="normal")
    repeat_days = Column(JSON, nullable=True)
    volume_value = Column(Integer, nullable=True)


class InboxTask(Base):
    __tablename__ = "inbox_tasks"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String, nullable=False, default="medium")
    category = Column(String, nullable=True)
    subtasks = Column(JSON, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # Set when the user assigns this inbox item to a day/week. We keep the
    # row alive as a reminder — the user removes it manually with the × button.
    assigned_at = Column(DateTime, nullable=True)
    # Set automatically when the linked DayTask is marked done.
    completed_at = Column(DateTime, nullable=True)
