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
    UniqueConstraint,
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

class Reminder(Base):
    """Личное напоминание: в назначенное время уходит в колокольчик и в TG-бота.

    Доставку выполняет цикл в planner/bot/bot.py (_reminders_loop) — он же
    создаёт Notification/NotificationRecipient и шлёт сообщение в Telegram.
    remind_at хранится наивным локальным временем сервера (как и остальные
    даты приложения).

    Жизненный цикл: pending (sent=false) → доставлено (sent=true) →
    ждёт ответа (ack is null; бот повторяет доставку по настройкам юзера) →
    ack='done'/'read'. Повторяющееся (recur_*) после ответа или пропуска
    целого цикла перепланируется на следующее срабатывание.
    """

    __tablename__ = "reminders"
    __table_args__ = {"schema": "notifications"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth.users.id"),
        nullable=False,
        index=True,
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)
    remind_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # manual — создано руками; task — автоматически из задачи дня.
    kind: Mapped[str] = mapped_column(
        String, nullable=False, default="manual", server_default="manual"
    )
    # Задача-источник для kind='task'; удаление задачи сносит напоминание.
    source_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("planning.day_tasks.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
        index=True,
    )

    # Повторяемость: каждые recur_every единиц recur_unit ('day'|'week'|'month').
    recur_every: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recur_unit: Mapped[str | None] = mapped_column(String, nullable=True)

    # Ответ пользователя на сработавшее напоминание: 'done' | 'read'.
    ack: Mapped[str | None] = mapped_column(String, nullable=True)
    ack_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Сколько повторных доставок уже сделано после первой.
    repeat_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
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

    # --- Настройки напоминаний ---
    # Дефолт «за сколько минут до начала задачи напомнить» (подставляется в чекбокс).
    task_reminder_lead_min = Column(Integer, nullable=False, default=10, server_default="10")
    # Повторная доставка, если на напоминание не ответили: интервал (0 = выключено)…
    reminder_repeat_min = Column(Integer, nullable=False, default=30, server_default="30")
    # …и максимум повторов.
    reminder_repeat_max = Column(Integer, nullable=False, default=3, server_default="3")
    # За сколько дней предупреждать о дедлайне цели (0 = выключено).
    goal_deadline_days = Column(Integer, nullable=False, default=3, server_default="3")


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


class McpAllowlistEntry(Base):
    """Explicit opt-in for the experimental remote MCP integration."""

    __tablename__ = "mcp_allowlist"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    granted_by_user_id = Column(
        Integer,
        ForeignKey("auth.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class McpOAuthClient(Base):
    __tablename__ = "mcp_oauth_clients"
    __table_args__ = {"schema": "auth"}

    client_id = Column(String, primary_key=True)
    client_name = Column(String, nullable=False)
    redirect_uris = Column(JSON, nullable=False, default=list)
    token_endpoint_auth_method = Column(
        String, nullable=False, default="none", server_default="none"
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class McpOAuthAuthorizationRequest(Base):
    __tablename__ = "mcp_oauth_authorization_requests"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    request_hash = Column(String, nullable=False, unique=True, index=True)
    client_id = Column(
        String,
        ForeignKey("auth.mcp_oauth_clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    redirect_uri = Column(Text, nullable=False)
    scopes = Column(JSON, nullable=False, default=list)
    state = Column(Text, nullable=True)
    code_challenge = Column(String, nullable=False)
    code_challenge_method = Column(String, nullable=False, default="S256")
    resource = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class McpOAuthAuthorizationCode(Base):
    __tablename__ = "mcp_oauth_authorization_codes"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    code_hash = Column(String, nullable=False, unique=True, index=True)
    client_id = Column(
        String,
        ForeignKey("auth.mcp_oauth_clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    redirect_uri = Column(Text, nullable=False)
    scopes = Column(JSON, nullable=False, default=list)
    code_challenge = Column(String, nullable=False)
    resource = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class McpOAuthGrant(Base):
    """One user-approved AI connection. Revoking it invalidates all its tokens."""

    __tablename__ = "mcp_oauth_grants"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        String,
        ForeignKey("auth.mcp_oauth_clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scopes = Column(JSON, nullable=False, default=list)
    resource = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True, index=True)


class McpOAuthAccessToken(Base):
    __tablename__ = "mcp_oauth_access_tokens"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    grant_id = Column(
        Integer,
        ForeignKey("auth.mcp_oauth_grants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class McpOAuthRefreshToken(Base):
    __tablename__ = "mcp_oauth_refresh_tokens"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    grant_id = Column(
        Integer,
        ForeignKey("auth.mcp_oauth_grants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    replaced_by_id = Column(
        Integer,
        ForeignKey("auth.mcp_oauth_refresh_tokens.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class McpAuditLog(Base):
    __tablename__ = "mcp_audit_log"
    __table_args__ = {"schema": "auth"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    grant_id = Column(
        Integer,
        ForeignKey("auth.mcp_oauth_grants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tool_name = Column(String, nullable=False, index=True)
    arguments = Column(JSON, nullable=False, default=dict)
    success = Column(Boolean, nullable=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


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


class ScheduleSubscription(Base):
    """Обновляемая ICS-подписка пользователя на расписание SSAU."""

    __tablename__ = "schedule_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_schedule_subscriptions_user_id"),
        {"schema": "planning"},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True)
    feed_url = Column(Text, nullable=False)
    subgroup = Column(String, nullable=False, default="all", server_default="all")
    last_synced_at = Column(DateTime, nullable=True)
    last_attempt_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    last_content_hash = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScheduleEvent(Base):
    """Последний полученный снимок одной пары из ICS-подписки."""

    __tablename__ = "schedule_events"
    __table_args__ = (
        UniqueConstraint("subscription_id", "event_key", name="uq_schedule_events_subscription_key"),
        {"schema": "planning"},
    )

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(
        Integer,
        ForeignKey("planning.schedule_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_key = Column(String, nullable=False)
    event_hash = Column(String, nullable=False)
    uid = Column(Text, nullable=True)
    day = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    duration_min = Column(Integer, nullable=False)
    subject = Column(String, nullable=False)
    teacher = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    lesson_type = Column(String, nullable=False, default="other", server_default="other")
    subgroup = Column(String, nullable=True)
    conference_url = Column(Text, nullable=True)


class ScheduleSyncAlert(Base):
    """Очередь Telegram-уведомлений об изменениях защищённых планов."""

    __tablename__ = "schedule_sync_alerts"
    __table_args__ = {"schema": "planning"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    telegram_sent_at = Column(DateTime, nullable=True, index=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")


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
    # 0 = selected calendar date, 1 = the following calendar date. Keeping
    # this separate from start_time makes 00:30 today and tomorrow unambiguous.
    start_day_offset = Column(Integer, nullable=False, default=0, server_default="0")
    duration_min = Column(Integer, nullable=True)

    priority = Column(String, default="medium")
    category = Column(String, nullable=True)
    status = Column(Integer, default=0)

    subtasks = Column(JSON, nullable=True)
    order_index = Column(Integer, nullable=False, default=0, index=True)
    source_week_task_id = Column(Integer, ForeignKey("planning.week_tasks.id"), nullable=True, index=True)
    source_inbox_task_id = Column(Integer, ForeignKey("planning.inbox_tasks.id"), nullable=True, index=True)
    # Техническая связь с ICS-подпиской. Задача остаётся обычной и полностью
    # редактируемой; поля нужны только для безопасного обновления пустых дней.
    schedule_subscription_id = Column(
        Integer,
        ForeignKey("planning.schedule_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    schedule_event_key = Column(String, nullable=True, index=True)
    schedule_lesson_type = Column(String, nullable=True)
    dismissed = Column(Boolean, default=False, nullable=False)
    # За сколько минут до начала напомнить (null = не напоминать).
    # Связанный Reminder(kind='task') синхронизирует routers/day.py.
    remind_lead_min = Column(Integer, nullable=True)
    # Якорное время для задач БЕЗ start_time (режим «Длительность»): снимок
    # вычисленного на фронте computed_start_time на момент включения
    # напоминания. В отличие от start_time не пересчитывается автоматически
    # при изменении порядка/длительности соседних задач — обновляется только
    # явным действием (тумблер/чекбокс), чтобы случайные PATCH других полей
    # (статус, подзадачи) не затирали и не «плавали».
    remind_anchor_time = Column(Time, nullable=True)
    # Sequential tasks can acquire a reminder anchor after midnight even
    # though they have no fixed start_time.
    remind_anchor_day_offset = Column(Integer, nullable=False, default=0, server_default="0")


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
    # Синхронизация расписания не изменяет день после первого ручного действия.
    plan_locked = Column(Boolean, nullable=False, default=False, server_default="false")


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
