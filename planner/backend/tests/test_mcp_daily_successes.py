import asyncio
from datetime import date

import pytest
from mcp.server.auth.provider import AccessToken
from mcp.server.fastmcp.exceptions import ToolError
from sqlalchemy.orm import Session

import mcp_server
from db import DailySuccess, McpAllowlistEntry, McpAuditLog, TaskCategory
from mcp_auth import MCP_RESOURCE_URL


@pytest.fixture
def successes_access(monkeypatch, _txn, db, user):
    user.daily_successes_enabled = True
    db.add(McpAllowlistEntry(user_id=user.id, enabled=True))
    db.commit()
    access = AccessToken(
        token='test', client_id='successes-test', subject=str(user.id),
        scopes=['planner:read', 'organizer:edit', 'organizer:delete'],
        resource=MCP_RESOURCE_URL, claims={'grant_id': 0},
    )
    monkeypatch.setattr(mcp_server, 'get_access_token', lambda: access)
    monkeypatch.setattr(mcp_server, 'SessionLocal', lambda: Session(bind=_txn, join_transaction_mode='create_savepoint'))
    return access


def make_category(db, user):
    category = TaskCategory(user_id=user.id, key='study', title='Учёба', color='#aabbcc', icon='book')
    db.add(category)
    db.commit()
    return category


def test_successes_crud_preserves_omitted_fields_and_redacts_audit(successes_access, db, user):
    category = make_category(db, user)
    created = mcp_server.create_daily_success(date(2026, 10, 9), '  Закончил отчёт  ', category.id)
    assert created['text'] == 'Закончил отчёт'
    assert created['day'] == '2026-10-09' and created['category']['id'] == category.id
    edited = mcp_server.edit_daily_success(created['id'], text='Защитил отчёт')
    assert edited['day'] == created['day'] and edited['category'] == created['category']
    moved = mcp_server.edit_daily_success(created['id'], day=date(2026, 10, 10))
    assert moved['day'] == '2026-10-10' and moved['text'] == edited['text']
    assert mcp_server.edit_daily_success(created['id'], clear_category=True)['category'] is None
    assert mcp_server.edit_daily_success(created['id'], category_id=category.id)['category']['id'] == category.id
    with pytest.raises(ToolError, match='Выбери категорию или её сброс'):
        mcp_server.edit_daily_success(created['id'], category_id=category.id, clear_category=True)
    assert mcp_server.delete_daily_success(created['id']) == {'ok': True}
    assert mcp_server.list_daily_successes() == {'items': [], 'has_more': False}
    db.expire_all()
    calls = db.query(McpAuditLog).filter(McpAuditLog.user_id == user.id).all()
    assert len(calls) == 8
    assert all(call.arguments.get('text') in (None, '[redacted]') for call in calls)
    assert any(call.tool_name == 'edit_daily_success' and not call.success for call in calls)


def test_successes_read_filters_summary_and_ownership(successes_access, db, user, other_user):
    own_category = make_category(db, user)
    foreign_category = make_category(db, other_user)
    for day in [9, 10]:
        mcp_server.create_daily_success(date(2026, 10, day), f'Успех {day}', own_category.id)
    mcp_server.create_daily_success(date(2026, 10, 10), 'Без категории')
    foreign = DailySuccess(user_id=other_user.id, day=date(2026, 10, 10), text='Чужая запись', category_id=foreign_category.id)
    db.add(foreign)
    db.commit()
    page = mcp_server.list_daily_successes(limit=1)
    assert len(page['items']) == 1 and page['has_more'] is True
    assert len(mcp_server.list_daily_successes(offset=1)['items']) == 2
    assert len(mcp_server.list_daily_successes(category_id=own_category.id)['items']) == 2
    assert len(mcp_server.list_daily_successes(uncategorized=True)['items']) == 1
    assert len(mcp_server.list_daily_successes(category_ids=[own_category.id, foreign_category.id], uncategorized=True)['items']) == 3
    assert len(mcp_server.list_daily_successes(category_ids=[own_category.id])['items']) == 2
    assert len(mcp_server.list_daily_successes(start_date=date(2026, 10, 9), end_date=date(2026, 10, 9))['items']) == 1
    summary = mcp_server.get_daily_successes_summary(date(2026, 10, 9), date(2026, 10, 10))
    assert summary['total'] == 3 and summary['days'] == 2
    assert [(row['total'], row['days']) for row in summary['categories']] == [(2, 2), (1, 1)]
    assert summary['categories'][0]['category']['id'] == own_category.id
    for operation in [lambda: mcp_server.edit_daily_success(foreign.id, text='Изменение'), lambda: mcp_server.delete_daily_success(foreign.id)]:
        with pytest.raises(ToolError, match='Запись не найдена'):
            operation()
    with pytest.raises(ToolError, match='Категория не найдена'):
        mcp_server.create_daily_success(date(2026, 10, 10), 'Тест', foreign_category.id)
    with pytest.raises(ToolError, match='Категория не найдена'):
        mcp_server.edit_daily_success(page['items'][0]['id'], category_id=foreign_category.id)
    with pytest.raises(ToolError, match='Выбери один фильтр'):
        mcp_server.list_daily_successes(category_id=own_category.id, uncategorized=True)
    with pytest.raises(ToolError, match='Дата начала'):
        mcp_server.get_daily_successes_summary(date(2026, 10, 10), date(2026, 10, 9))
    db.expire_all()
    assert db.get(DailySuccess, foreign.id).text == 'Чужая запись'


@pytest.mark.parametrize('operation', ['list', 'summary', 'create', 'edit', 'delete'])
def test_successes_tools_require_experiment(successes_access, db, user, operation):
    row = mcp_server.create_daily_success(date(2026, 10, 10), 'Сохранённая запись')
    user.daily_successes_enabled = False
    db.commit()
    calls = {
        'list': lambda: mcp_server.list_daily_successes(),
        'summary': lambda: mcp_server.get_daily_successes_summary(),
        'create': lambda: mcp_server.create_daily_success(date(2026, 10, 10), 'Новая запись'),
        'edit': lambda: mcp_server.edit_daily_success(row['id'], text='Изменение'),
        'delete': lambda: mcp_server.delete_daily_success(row['id']),
    }
    with pytest.raises(ToolError, match='Включи успехи'):
        calls[operation]()
    db.expire_all()
    assert db.get(DailySuccess, row['id']).text == 'Сохранённая запись'
    assert db.query(DailySuccess).filter(DailySuccess.user_id == user.id).count() == 1


def test_successes_tools_enforce_scopes_and_authentication(successes_access, db, user, monkeypatch):
    row = mcp_server.create_daily_success(date(2026, 10, 10), 'Мой успех')
    successes_access.scopes = ['planner:read']
    assert len(mcp_server.list_daily_successes()['items']) == 1
    assert mcp_server.get_daily_successes_summary()['total'] == 1
    for operation in [lambda: mcp_server.create_daily_success(date(2026, 10, 10), 'Новый'), lambda: mcp_server.edit_daily_success(row['id'], text='Другой')]:
        with pytest.raises(ToolError, match='organizer:edit'):
            operation()
    with pytest.raises(ToolError, match='organizer:delete'):
        mcp_server.delete_daily_success(row['id'])
    successes_access.scopes = ['organizer:edit']
    with pytest.raises(ToolError, match='planner:read'):
        mcp_server.get_daily_successes_summary()
    monkeypatch.setattr(mcp_server, 'get_access_token', lambda: None)
    with pytest.raises(ToolError, match='Authentication is required'):
        mcp_server.list_daily_successes()
    db.expire_all()
    assert db.get(DailySuccess, row['id']).text == 'Мой успех'


@pytest.mark.parametrize('name,arguments', [
    ('list_daily_successes', {'limit': 0}),
    ('list_daily_successes', {'limit': 101}),
    ('list_daily_successes', {'offset': -1}),
    ('create_daily_success', {'day': 'bad-date', 'text': 'Тест'}),
    ('create_daily_success', {'day': '2026-10-10', 'text': 'x' * 1501}),
    ('create_daily_success', {'day': '2026-10-10', 'text': '   '}),
    ('edit_daily_success', {'success_id': -1}),
])
def test_mcp_successes_validates_inputs(successes_access, db, user, name, arguments):
    with pytest.raises(ToolError):
        asyncio.run(mcp_server.mcp.call_tool(name, arguments))
    assert db.query(DailySuccess).filter(DailySuccess.user_id == user.id).count() == 0
