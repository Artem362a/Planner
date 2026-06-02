from __future__ import annotations

from datetime import date
from datetime import time as _time
from typing import Any, List, Literal, Protocol

from pydantic import BaseModel

class NotificationCreateIn(BaseModel):
    title: str
    message: str
    audience_type: Literal["single", "group", "all"]
    user_ids: list[int] = []

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    created_at: str
    is_read: bool

class NotificationCountOut(BaseModel):
    unread_count: int

class UserShortOut(BaseModel):
    id: int
    email: str
    username: str
    role: str

class CategoryIn(BaseModel):
    title: str
    color: str
    icon: str = "tag"


class CategoryUpdateIn(BaseModel):
    title: str
    color: str
    icon: str = "tag"


class CategoryOut(BaseModel):
    id: int
    key: str
    title: str
    color: str
    icon: str = "tag"

class MessageOut(BaseModel):
    message: str

class FeedbackIn(BaseModel):
    category: str
    type: str
    name: str | None = None
    contact: str | None = None
    message: str


class FeedbackOut(BaseModel):
    id: int
    category: str
    type: str
    name: str | None = None
    contact: str | None = None
    message: str
    created_at: str
    status: str
    developer_reply: str | None = None
    developer_replied_at: str | None = None
    screenshots: list[str] | None = None

class FeedbackReplyIn(BaseModel):
    reply: str

class FeedbackStatusUpdateIn(BaseModel):
    status: Literal["new", "in_progress", "resolved"]

class TaskCategoryRow(Protocol):
    id: int
    key: str
    title: str
    color: str
    icon: str


class UserRegisterIn(BaseModel):
    email: str
    username: str
    password: str


class UserLoginIn(BaseModel):
    email: str
    password: str


class UserProfileUpdateIn(BaseModel):
    username: str
    avatar: str | None = None


class UserPasswordUpdateIn(BaseModel):
    current_password: str
    new_password: str


class UserThemeUpdateIn(BaseModel):
    theme: Literal["light", "dark"]


class UserDayStartUpdateIn(BaseModel):
    default_day_start_time: str  # "HH:MM" or "HH:MM:SS"


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str
    avatar: str | None = None
    theme: str = "light"
    default_day_start_time: str = "06:00"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionOut(BaseModel):
    id: int
    user_agent: str | None = None
    ip_address: str | None = None
    created_at: str
    last_seen_at: str
    is_current: bool = False


class AccountDeleteIn(BaseModel):
    password: str


class SubTask(BaseModel):
    id: int | None = None
    title: str
    done: bool = False


class TaskIn(BaseModel):
    title: str
    start_time: str | None = None
    duration_min: int | None = None
    priority: str = "medium"
    category: str | None = None
    status: int = 0
    subtasks: List[SubTask] = []
    insert_before_id: int | None = None
    source_week_task_id: int | None = None

class TaskOut(TaskIn):
    id: int
    day: date
    order_index: int = 0


class DayTaskReorderIn(BaseModel):
    ordered_ids: list[int]


class DayNoteOut(BaseModel):
    day: date
    text: str


class DayNoteIn(BaseModel):
    text: str


class DaySettingsIn(BaseModel):
    start_time: str


class WeekImportCandidateOut(BaseModel):
    week_task_id: int
    import_day: date
    title: str
    category: str | None = None
    important: bool = False
    task_type: str = "normal"
    subtasks: list[SubTask] = []
    start_date: date | None = None
    end_date: date | None = None
    is_overdue: bool = False

class ImportWeekTaskItemIn(BaseModel):
    week_task_id: int
    import_day: date
    is_overdue: bool = False

class ImportWeekTasksIn(BaseModel):
    target_day: date
    items: list[ImportWeekTaskItemIn]


class WeekSubTask(BaseModel):
    id: int | None = None
    title: str
    done: bool = False


class WeekTaskIn(BaseModel):
    name: str
    start_date: date
    end_date: date
    category: str | None = None
    important: bool = False
    status: int = 0
    task_type: str = "normal"
    repeat_days: list[int] = []
    volume_value: int | None = None
    subtasks: list[WeekSubTask] = []


class WeekTaskOut(WeekTaskIn):
    id: int
    order_index: int = 0


class WeekTaskReorderIn(BaseModel):
    ordered_ids: list[int]


class TemplateTask(BaseModel):
    title: str
    start_time: str | None = None
    duration_min: int | None = None
    priority: str = "medium"
    category: str | None = None
    subtasks: list[SubTask] = []


class DayTemplateIn(BaseModel):
    name: str
    color: str = "#f0e7ff"
    tasks: list[TemplateTask]


class DayTemplatePatch(BaseModel):
    name: str | None = None
    color: str | None = None
    tasks: list[TemplateTask] | None = None


class DayTemplateOut(BaseModel):
    id: int
    name: str
    color: str
    tasks: list[TemplateTask]


class WeekTemplateTaskIn(BaseModel):
    name: str
    category: str | None = None
    important: bool = False
    status: int = 0
    task_type: str = "normal"
    repeat_days: list[int] = []
    volume_value: int | None = None
    start_offset: int = 0
    end_offset: int = 0
    subtasks: list[WeekSubTask] = []


class WeekTemplateIn(BaseModel):
    name: str
    color: str = "#f0e7ff"
    tasks: list[WeekTemplateTaskIn]


class WeekTemplatePatch(BaseModel):
    name: str | None = None
    color: str | None = None
    tasks: list[WeekTemplateTaskIn] | None = None


class WeekTemplateOut(BaseModel):
    id: int
    name: str
    color: str
    tasks: list[WeekTemplateTaskIn]


class WeekTemplateApplyIn(BaseModel):
    week_start: date


class WeekTaskRow(Protocol):
    id: int
    name: str
    start_date: date
    end_date: date
    category: str | None
    important: bool
    status: int
    subtasks: Any
    order_index: int
    task_type: str
    repeat_days: Any
    volume_value: int | None
    source_week_task_id: int | None


class WeekTemplateRow(Protocol):
    id: int
    name: str
    color: str
    tasks_json: Any

class GoalStageIn(BaseModel):
    title: str
    done: bool = False
    planned_date: date | None = None


class GoalStageOut(BaseModel):
    id: int
    title: str
    done: bool
    order_index: int
    planned_date: date | None = None


class GoalIn(BaseModel):
    title: str
    description: str | None = None
    color: str = "#7ECF8A"
    status: str = "active"
    goal_type: str = "one_time"
    target_date: date | None = None
    repeat_unit: str | None = None
    has_stages: bool = False
    schedule_mode: str | None = None
    category_key: str | None = None

class GoalOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    color: str
    status: str
    order_index: int
    created_at: str
    goal_type: str = "one_time"
    target_date: date | None = None
    repeat_unit: str | None = None
    has_stages: bool = False
    schedule_mode: str | None = None
    category_key: str | None = None
    stages: list[GoalStageOut] = []
    progress: float = 0.0
    day_done: bool = False
    is_focus: bool = False


class GoalReorderIn(BaseModel):
    ordered_ids: list[int]


class GoalStageReorderIn(BaseModel):
    ordered_ids: list[int]


class GoalWeekItemOut(BaseModel):
    id: str
    kind: str
    goal_id: int
    stage_id: int | None = None
    goal_title: str
    title: str
    meta: str | None = None
    color: str
    done: bool


class GoalWeekItemToggleIn(BaseModel):
    kind: str
    goal_id: int
    stage_id: int | None = None
    week_start: date


class DaySettingsRow(Protocol):
    id: int
    day: date
    start_time: _time


class DayTemplateRow(Protocol):
    id: int
    name: str
    color: str
    tasks_json: Any


class DayTaskRow(Protocol):
    id: int
    day: date
    title: str
    start_time: _time | None
    duration_min: int | None
    priority: str
    category: str | None
    status: int
    subtasks: Any
    order_index: int
    source_week_task_id: int | None




class GoalDayItemToggleIn(BaseModel):
    goal_id: int
    stage_id: int | None = None
    day: date


class OverdueTaskOut(BaseModel):
    id: int
    title: str
    category: str | None = None
    category_color: str | None = None
    priority: str
    day: date
    source_week_task_id: int | None = None
    week_start_date: date | None = None
    week_end_date: date | None = None
    subtasks: List[SubTask] = []


class RescheduleIn(BaseModel):
    new_date: date


class InboxTaskIn(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    category: str | None = None
    subtasks: List[SubTask] = []


class InboxTaskUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    category: str | None = None
    subtasks: List[SubTask] | None = None


class InboxTaskOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    priority: str
    category: str | None = None
    subtasks: List[SubTask] = []
    created_at: str
    assigned_at: str | None = None
    completed_at: str | None = None


class InboxAssignDayIn(BaseModel):
    day: date


class InboxAssignWeekIn(BaseModel):
    week_start: date
