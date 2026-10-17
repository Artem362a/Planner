from datetime import date

from db import DailySuccess, TaskCategory


def enable(client, headers):
    response = client.put('/experimental/daily-successes', headers=headers, json={'enabled': True})
    assert response.status_code == 200
    assert response.json()['daily_successes_enabled'] is True


def payload(text='Разобрался с темой', category_id=None, day='2026-09-15'):
    return {'day': day, 'text': text, 'category_id': category_id}


def test_opt_in_persisted_and_disabled_by_default(client, auth_headers, other_auth_headers):
    assert client.get('/auth/me', headers=auth_headers).json()['daily_successes_enabled'] is False
    assert client.get('/daily-successes', headers=auth_headers).status_code == 403
    assert client.post('/daily-successes', headers=auth_headers, json=payload()).status_code == 403
    enable(client, auth_headers)
    assert client.get('/auth/me', headers=auth_headers).json()['daily_successes_enabled'] is True
    assert client.get('/auth/me', headers=other_auth_headers).json()['daily_successes_enabled'] is False


def test_crud_filters_and_user_isolation(client, db, user, other_user, auth_headers, other_auth_headers):
    enable(client, auth_headers)
    enable(client, other_auth_headers)
    category = TaskCategory(user_id=user.id, key='study', title='Учёба', color='#aabbcc', icon='book')
    foreign = TaskCategory(user_id=other_user.id, key='other', title='Чужая', color='#aabbcc')
    db.add_all([category, foreign])
    db.commit()
    response = client.post('/daily-successes', headers=auth_headers, json=payload('  Закончил отчёт  ', category.id))
    assert response.status_code == 201
    item = response.json()
    assert item['text'] == 'Закончил отчёт'
    assert item['category']['title'] == 'Учёба'
    item_id = item['id']
    client.post('/daily-successes', headers=auth_headers, json=payload('Другая дата', day='2026-09-16'))
    client.post('/daily-successes', headers=other_auth_headers, json=payload('Чужой результат'))
    assert len(client.get('/daily-successes', headers=auth_headers).json()['items']) == 2
    assert len(client.get('/daily-successes?start_date=2026-09-15&end_date=2026-09-15', headers=auth_headers).json()['items']) == 1
    assert len(client.get(f'/daily-successes?category_id={category.id}', headers=auth_headers).json()['items']) == 1
    assert len(client.get('/daily-successes?uncategorized=true', headers=auth_headers).json()['items']) == 1
    assert client.put(f'/daily-successes/{item_id}', headers=other_auth_headers, json=payload()).status_code == 404
    assert client.delete(f'/daily-successes/{item_id}', headers=other_auth_headers).status_code == 404
    assert client.post('/daily-successes', headers=auth_headers, json=payload(category_id=foreign.id)).status_code == 404
    assert client.put(f'/daily-successes/{item_id}', headers=auth_headers, json=payload('Отредактирован', None)).json()['category'] is None
    assert client.delete(f'/daily-successes/{item_id}', headers=auth_headers).status_code == 200
    assert client.delete(f'/daily-successes/{item_id}', headers=auth_headers).status_code == 404


def test_disabling_keeps_records_and_blocks_access(client, auth_headers):
    enable(client, auth_headers)
    item = client.post('/daily-successes', headers=auth_headers, json=payload()).json()
    assert client.put('/experimental/daily-successes', headers=auth_headers, json={'enabled': False}).json()['daily_successes_enabled'] is False
    assert client.get('/daily-successes', headers=auth_headers).status_code == 403
    assert client.put(f"/daily-successes/{item['id']}", headers=auth_headers, json=payload()).status_code == 403
    assert client.delete(f"/daily-successes/{item['id']}", headers=auth_headers).status_code == 403
    enable(client, auth_headers)
    assert client.get('/daily-successes', headers=auth_headers).json()['items'] == [item]


def test_validation_and_pagination(client, auth_headers):
    enable(client, auth_headers)
    for invalid in [payload('   '), payload('x'*1501), payload(day='bad-date')]:
        assert client.post('/daily-successes', headers=auth_headers, json=invalid).status_code == 422
    assert client.get('/daily-successes?start_date=2026-09-20&end_date=2026-09-01', headers=auth_headers).status_code == 400
    for i in range(3):
        client.post('/daily-successes', headers=auth_headers, json=payload(str(i)))
    first=client.get('/daily-successes?limit=2', headers=auth_headers).json()
    second=client.get('/daily-successes?limit=2&offset=2', headers=auth_headers).json()
    assert first['has_more'] is True and second['has_more'] is False
    assert [row['text'] for row in first['items']+second['items']] == ['2','1','0']


def test_deleted_category_keeps_success_and_history_uses_earliest_success(client, db, user, auth_headers):
    enable(client, auth_headers)
    category=TaskCategory(user_id=user.id,key='example',title='Категория',color='#aabbcc')
    db.add(category)
    db.commit()
    db.add(DailySuccess(user_id=user.id,day=date(2020,1,1),text='Давний успех',category_id=category.id))
    db.commit()
    db.delete(category)
    db.commit()
    assert client.get('/daily-successes', headers=auth_headers).json()['items'][0]['category'] is None
    stats=client.get('/statistics?all_time=true', headers=auth_headers).json()
    assert stats['period']['start'] == '2020-01-01'
    assert stats['tasks']['total'] == 0
    exported=client.get('/auth/export',headers=auth_headers).json()
    assert exported['daily_successes'][0]['text'] == 'Давний успех'
    assert exported['user']['daily_successes_enabled'] is True


def test_authentication_required(client):
    assert client.get('/daily-successes').status_code == 401
    assert client.get('/daily-successes/summary').status_code == 401
    assert client.put('/experimental/daily-successes',json={'enabled':True}).status_code == 401


def test_multiple_categories_with_uncategorized_period_and_pagination(client, db, user, other_user, auth_headers):
    enable(client, auth_headers)
    categories = [TaskCategory(user_id=user.id, key=key, title=key, color='#aabbcc') for key in ['work', 'study', 'rest']]
    foreign = TaskCategory(user_id=other_user.id, key='foreign', title='Foreign', color='#aabbcc')
    db.add_all([*categories, foreign])
    db.commit()
    db.add_all([
        DailySuccess(user_id=user.id, day=date(2026, 10, 10), text=category.key, category_id=category.id)
        for category in categories
    ] + [
        DailySuccess(user_id=user.id, day=date(2026, 10, 10), text='none'),
        DailySuccess(user_id=user.id, day=date(2026, 10, 9), text='outside', category_id=categories[0].id),
        DailySuccess(user_id=other_user.id, day=date(2026, 10, 10), text='foreign', category_id=foreign.id),
    ])
    db.commit()
    params = [('category_ids', str(category.id)) for category in [*categories[:2], categories[0], foreign]]
    params += [('uncategorized', 'true'), ('start_date', '2026-10-10'), ('end_date', '2026-10-10')]
    first = client.get('/daily-successes', headers=auth_headers, params=params + [('limit', '2')]).json()
    second = client.get('/daily-successes', headers=auth_headers, params=params + [('limit', '2'), ('offset', '2')]).json()
    assert first['has_more'] is True and second['has_more'] is False
    assert {row['text'] for row in first['items'] + second['items']} == {'work', 'study', 'none'}
    assert len(first['items'] + second['items']) == 3
    categorized = client.get('/daily-successes', headers=auth_headers, params=[('category_ids', str(category.id)) for category in categories[:2]]).json()
    assert {row['text'] for row in categorized['items']} == {'work', 'study', 'outside'}
    assert client.get('/daily-successes?category_ids=0', headers=auth_headers).status_code == 422
    assert client.get('/daily-successes', headers=auth_headers, params=params + [('category_id', str(categories[0].id))]).status_code == 400


def test_summary_aggregates_entire_period_and_distinct_days(client, db, user, other_user, auth_headers):
    assert client.get('/daily-successes/summary', headers=auth_headers).status_code == 403
    enable(client, auth_headers)
    category = TaskCategory(user_id=user.id, key='study', title='Учёба', color='#aabbcc', icon='book')
    db.add(category)
    db.commit()
    db.add_all([
        DailySuccess(user_id=user.id, day=date(2026, 9, 15 + i % 2), text=f'Успех {i}', category_id=category.id)
        for i in range(65)
    ] + [
        DailySuccess(user_id=user.id, day=date(2026, 9, 16), text='Без категории'),
        DailySuccess(user_id=user.id, day=date(2026, 8, 1), text='Вне периода', category_id=category.id),
        DailySuccess(user_id=other_user.id, day=date(2026, 9, 15), text='Чужая запись'),
    ])
    db.commit()
    period = '?start_date=2026-09-15&end_date=2026-09-16'
    result = client.get('/daily-successes/summary' + period, headers=auth_headers).json()
    assert result['total'] == 66 and result['days'] == 2
    assert [(row['total'], row['days']) for row in result['categories']] == [(65, 2), (1, 1)]
    assert result['categories'][0]['category']['id'] == category.id
    assert result['categories'][1]['category'] is None
    assert len(client.get('/daily-successes' + period, headers=auth_headers).json()['items']) == 50
    empty = client.get('/daily-successes/summary?start_date=2020-01-01&end_date=2020-01-02', headers=auth_headers).json()
    assert empty == {'total': 0, 'days': 0, 'categories': []}
    assert client.get('/daily-successes/summary?start_date=2026-09-20&end_date=2026-09-01', headers=auth_headers).status_code == 400
    db.delete(category)
    db.commit()
    deleted = client.get('/daily-successes/summary' + period, headers=auth_headers).json()
    assert deleted['categories'] == [{'category': None, 'total': 66, 'days': 2}]
