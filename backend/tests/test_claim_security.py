"""Offline security regression tests; never contact production or send mail."""
import asyncio
import hashlib
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'offline_claim_tests')
import server
from fastapi import HTTPException
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient
import pytest


@pytest.fixture
def database(monkeypatch):
    db = AsyncMongoMockClient(tz_aware=True).test
    monkeypatch.setattr(server, 'db', db)
    monkeypatch.setattr(server, 'WEBSITE_FORM_SECRET', 'offline-secret')
    return db


def run(coro):
    return asyncio.run(coro)


def patient(uid='patient-a', email='patient@example.com'):
    return dict(user_id=uid, role='patient', _google_email=email, _google_sub='google-sub')


async def create():
    return await server.create_website_appointment_request(
        server.WebsiteAppointmentRequestCreate(full_name='Example', phone='1234567890',
            email='Patient@example.com', health_concern='Private', consultation_mode='online'),
        'offline-secret')


def test_token_persistence_and_redaction(database):
    async def scenario():
        result = await create()
        stored = await database.appointment_requests.find_one({'id': result.id})
        assert stored['claim_token_hash'] == hashlib.sha256(result.claim_token.encode()).hexdigest()
        assert 'claim_token' not in stored
        assert stored['claim_version'] == 2
        assert stored['claim_expires_at'] > datetime.now(timezone.utc)
        assert set(result.model_dump()) == {'id', 'claim_token'}
        assert 'claim_token_hash' not in server.WebsiteAppointmentRequest(**stored).model_dump()
    run(scenario())


@pytest.mark.parametrize('case', ['wrong-email', 'phone-session', 'expired', 'legacy', 'claimed', 'invalid'])
def test_claim_denied_without_leaking_booking(database, case):
    async def scenario():
        result = await create()
        user = patient()
        token = result.claim_token
        if case == 'wrong-email': user['_google_email'] = 'other@example.com'
        if case == 'phone-session': user.pop('_google_sub')
        if case == 'expired':
            await database.appointment_requests.update_one({'id': result.id}, {'$set': {'claim_expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)}})
        if case == 'legacy':
            await database.appointment_requests.update_one({'id': result.id}, {'$unset': {'claim_version': ''}})
        if case == 'claimed':
            await database.appointment_requests.update_one({'id': result.id}, {'$set': {'claimed_by_user_id': 'someone'}})
        if case == 'invalid': token = 'random'
        with pytest.raises(HTTPException) as error:
            await server.claim_website_appointment_request(server.WebsiteAppointmentClaim(claim_token=token), user)
        assert error.value.status_code in (400, 403)
        assert 'Private' not in error.value.detail
    run(scenario())


def test_atomic_single_use(database):
    async def scenario():
        result = await create()
        payload = server.WebsiteAppointmentClaim(claim_token=result.claim_token)
        results = await asyncio.gather(*[server.claim_website_appointment_request(payload, patient()) for _ in range(2)], return_exceptions=True)
        assert sum(isinstance(r, server.WebsiteAppointmentRequest) for r in results) == 1
        assert sum(isinstance(r, HTTPException) for r in results) == 1
        row = await database.appointment_requests.find_one({'id': result.id})
        assert row['claimed_by_user_id'] == 'patient-a'
        assert 'claim_token_hash' not in row
    run(scenario())


def test_existing_link_preserved(database):
    async def scenario():
        await database.users.insert_many([dict(user_id='patient-a', role='patient', name='P'), dict(user_id='doctor', role='doctor', name='D')])
        await database.appointment_requests.insert_one(dict(id='old', claimed_by_user_id='patient-a', status='converted', scheduled_date='2026-12-01', linked_appointment_id='existing'))
        await database.appointments.insert_one(dict(id='existing', patient_id='patient-a', doctor_id='doctor', consultation_notes='Keep notes'))
        await server._sync_website_appointment('old')
        assert await database.appointments.count_documents({}) == 1
        row = await database.appointments.find_one({'id': 'existing'})
        assert row['consultation_notes'] == 'Keep notes'
        assert row['patient_id'] == 'patient-a'
    run(scenario())


def test_other_patient_cannot_access_records(database, monkeypatch):
    run(database.appointments.insert_one(dict(id='appt', patient_id='owner', doctor_id='doctor')))
    run(database.files.insert_one(dict(id='file', patient_id='owner', storage_path='secret')))
    storage = AsyncMock()
    monkeypatch.setattr(server, 'run_in_threadpool', storage)
    server.app.dependency_overrides[server.get_current_user] = lambda: patient('intruder')
    try:
        client = TestClient(server.app)
        for method, path, body in [
            ('GET', '/api/appointments/appt', None),
            ('PATCH', '/api/appointments/appt', {'consultation_notes': 'attack'}),
            ('GET', '/api/appointments/appt/messages', None),
            ('POST', '/api/appointments/appt/messages', {'text': 'attack'}),
            ('GET', '/api/files/file/content', None),
            ('PATCH', '/api/files/file/reply', {'doctor_reply': 'attack'}),
            ('GET', '/api/files/patient/owner', None),
            ('GET', '/api/appointment-requests', None),
        ]:
            response = client.request(method, path, json=body)
            assert response.status_code == 403, (path, response.text)
            assert response.headers['cache-control'] == 'no-store'
        assert not storage.called
    finally:
        server.app.dependency_overrides.clear()


def test_google_evidence_bound_to_session(database):
    async def scenario():
        await database.users.insert_one(dict(user_id='patient-a', role='patient', name='P', uhid='existing', email='patient@example.com'))
        await database.oauth_codes.insert_one(dict(code='one-use', user_id='patient-a', google_verified_email='patient@example.com', google_sub='subject', expires_at=datetime.now(timezone.utc) + timedelta(minutes=1)))
        result = await server.google_exchange(server.GoogleCodeExchange(code='one-use'))
        user = await server.get_current_user('Bearer ' + result['session_token'])
        assert user['_google_email'] == 'patient@example.com'
        assert user['_google_sub'] == 'subject'
        with pytest.raises(HTTPException):
            await server.google_exchange(server.GoogleCodeExchange(code='one-use'))
        await database.user_sessions.insert_one(dict(session_token='phone', user_id='patient-a', expires_at=datetime.now(timezone.utc) + timedelta(minutes=1)))
        phone_user = await server.get_current_user('Bearer phone')
        assert phone_user['_google_email'] is None
        assert phone_user['_google_sub'] is None
    run(scenario())


def test_linked_appointment_owner_conflict_preserves_records(database):
    async def scenario():
        await database.users.insert_many([dict(user_id='patient-a', role='patient', name='P'), dict(user_id='doctor', role='doctor', name='D')])
        await database.appointment_requests.insert_one(dict(id='old', claimed_by_user_id='patient-a', status='converted', scheduled_date='2026-12-01', linked_appointment_id='existing'))
        original = dict(id='existing', patient_id='different-owner', doctor_id='doctor', consultation_notes='Private', date='2026-11-01')
        await database.appointments.insert_one(original.copy())
        await server._sync_website_appointment('old')
        row = await database.appointments.find_one({'id': 'existing'}, {'_id': 0})
        assert row == original
    run(scenario())


def test_other_doctor_and_unauthenticated_denied(database):
    run(database.appointments.insert_one(dict(id='appt', patient_id='owner', doctor_id='assigned-doctor')))
    client = TestClient(server.app)
    assert client.get('/api/appointments/appt').status_code == 401
    server.app.dependency_overrides[server.get_current_user] = lambda: dict(user_id='other-doctor', role='doctor')
    try:
        assert client.get('/api/appointments/appt').status_code == 403
        assert client.get('/api/appointments/appt/messages').status_code == 403
        assert client.patch('/api/appointments/appt', json={'consultation_notes': 'attack'}).status_code == 403
    finally:
        server.app.dependency_overrides.clear()
