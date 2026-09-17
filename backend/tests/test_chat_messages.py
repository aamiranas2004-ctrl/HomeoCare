"""Tests for per-appointment doctor/patient chat (iter 4).

Endpoints covered:
  - POST /api/appointments/{id}/messages
  - GET  /api/appointments/{id}/messages
  - GET  /api/chat/unread
"""
import random
import pytest
import requests

from conftest import API, auth_headers, _fresh_phone


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def chat_http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def chat_patient(chat_http):
    phone = _fresh_phone()
    r = chat_http.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200
    r = chat_http.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "otp": "123456", "name": "TEST Chat Patient", "role": "patient"},
    )
    assert r.status_code == 200, r.text
    b = r.json()
    return {"token": b["session_token"], "user": b["user"]}


@pytest.fixture(scope="module")
def chat_other_patient(chat_http):
    """A DIFFERENT patient who is not a participant in the appointment."""
    phone = _fresh_phone()
    chat_http.post(f"{API}/auth/otp/request", json={"phone": phone})
    r = chat_http.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "otp": "123456", "name": "TEST Other Patient", "role": "patient"},
    )
    assert r.status_code == 200, r.text
    b = r.json()
    return {"token": b["session_token"], "user": b["user"]}


@pytest.fixture(scope="module")
def chat_doctor(chat_http):
    r = chat_http.post(
        f"{API}/auth/otp/verify", json={"phone": "+917294136264", "otp": "123456"}
    )
    assert r.status_code == 200, r.text
    b = r.json()
    return {"token": b["session_token"], "user": b["user"]}


@pytest.fixture(scope="module")
def chat_appointment(chat_http, chat_patient, chat_doctor):
    r = chat_http.post(
        f"{API}/appointments",
        headers=auth_headers(chat_patient["token"]),
        json={
            "doctor_id": chat_doctor["user"]["user_id"],
            "date": "2026-02-01",
            "time_slot": "10:00 AM",
            "mode": "online",
            "symptoms": "TEST chat thread",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# POST /appointments/{id}/messages
# ---------------------------------------------------------------------------
class TestChatSendPatient:
    def test_patient_posts_message(self, chat_http, chat_patient, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": "Hello doctor, I have a fever."},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["appointment_id"] == chat_appointment["id"]
        assert body["sender_role"] == "patient"
        assert body["sender_id"] == chat_patient["user"]["user_id"]
        assert body["sender_name"] == chat_patient["user"]["name"]
        assert body["text"] == "Hello doctor, I have a fever."
        assert body["read_by_patient"] is True
        assert body["read_by_doctor"] is False
        assert "id" in body and "created_at" in body


# ---------------------------------------------------------------------------
# GET /appointments/{id}/messages
# ---------------------------------------------------------------------------
class TestChatReadMarking:
    def test_doctor_get_marks_patient_msg_read(
        self, chat_http, chat_doctor, chat_appointment
    ):
        # First GET: triggers the read-marker update (DB is updated AFTER the
        # find() so the snapshot returned to the caller can still show unread;
        # that's why we verify the persisted state via a SECOND GET below).
        r = chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_doctor["token"]),
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1

        # Second GET reflects the persisted read state
        r = chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_doctor["token"]),
        )
        assert r.status_code == 200, r.text
        for m in r.json():
            if m["sender_role"] == "patient":
                assert m["read_by_doctor"] is True, m

    def test_doctor_unread_zero_after_read(
        self, chat_http, chat_doctor, chat_appointment
    ):
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_doctor["token"]))
        assert r.status_code == 200, r.text
        unread = r.json()
        # No unread patient messages remain for this appointment
        assert unread.get(chat_appointment["id"], 0) == 0


# ---------------------------------------------------------------------------
# Doctor reply, patient read marking
# ---------------------------------------------------------------------------
class TestChatDoctorReply:
    def test_doctor_posts_reply(self, chat_http, chat_doctor, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_doctor["token"]),
            json={"text": "Please take rest and drink fluids."},
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["sender_role"] == "doctor"
        assert b["sender_id"] == chat_doctor["user"]["user_id"]
        assert b["read_by_doctor"] is True
        assert b["read_by_patient"] is False

    def test_patient_sees_unread_doctor_msg(
        self, chat_http, chat_patient, chat_appointment
    ):
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_patient["token"]))
        assert r.status_code == 200, r.text
        unread = r.json()
        assert unread.get(chat_appointment["id"], 0) >= 1

    def test_patient_get_marks_doctor_msg_read(
        self, chat_http, chat_patient, chat_appointment
    ):
        # First GET triggers the DB read-mark update
        r = chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
        )
        assert r.status_code == 200, r.text
        # Second GET returns the persisted state
        r = chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
        )
        assert r.status_code == 200, r.text
        for m in r.json():
            if m["sender_role"] == "doctor":
                assert m["read_by_patient"] is True, m
        # Unread should now be 0 for patient too
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_patient["token"]))
        assert r.status_code == 200
        assert r.json().get(chat_appointment["id"], 0) == 0


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------
class TestChatValidation:
    def test_empty_text_returns_400(self, chat_http, chat_patient, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": ""},
        )
        assert r.status_code == 400, r.text

    def test_whitespace_only_returns_400(self, chat_http, chat_patient, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": "   \n\t  "},
        )
        assert r.status_code == 400, r.text

    def test_too_long_returns_400(self, chat_http, chat_patient, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": "x" * 2001},
        )
        assert r.status_code == 400, r.text

    def test_2000_char_boundary_ok(self, chat_http, chat_patient, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": "y" * 2000},
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Not-found / Forbidden / Unauthorized
# ---------------------------------------------------------------------------
class TestChatAccessControl:
    def test_unknown_appointment_get_404(self, chat_http, chat_patient):
        r = chat_http.get(
            f"{API}/appointments/does-not-exist-xyz/messages",
            headers=auth_headers(chat_patient["token"]),
        )
        assert r.status_code == 404, r.text

    def test_unknown_appointment_post_404(self, chat_http, chat_patient):
        r = chat_http.post(
            f"{API}/appointments/does-not-exist-xyz/messages",
            headers=auth_headers(chat_patient["token"]),
            json={"text": "hi"},
        )
        assert r.status_code == 404, r.text

    def test_non_participant_get_403(
        self, chat_http, chat_other_patient, chat_appointment
    ):
        r = chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_other_patient["token"]),
        )
        assert r.status_code == 403, r.text

    def test_non_participant_post_403(
        self, chat_http, chat_other_patient, chat_appointment
    ):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_other_patient["token"]),
            json={"text": "intruder"},
        )
        assert r.status_code == 403, r.text

    def test_unauthorized_get_messages_401(self, chat_http, chat_appointment):
        r = chat_http.get(f"{API}/appointments/{chat_appointment['id']}/messages")
        assert r.status_code == 401, r.text

    def test_unauthorized_post_messages_401(self, chat_http, chat_appointment):
        r = chat_http.post(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            json={"text": "hi"},
        )
        assert r.status_code == 401, r.text

    def test_unauthorized_unread_401(self, chat_http):
        r = chat_http.get(f"{API}/chat/unread")
        assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# Unread counts aggregation
# ---------------------------------------------------------------------------
class TestChatUnreadCounts:
    def test_unread_reflects_new_patient_messages_on_doctor_side(
        self, chat_http, chat_patient, chat_doctor, chat_appointment
    ):
        # Baseline: doctor reads current thread so unread = 0 before we start
        chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_doctor["token"]),
        )
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_doctor["token"]))
        assert r.status_code == 200
        assert r.json().get(chat_appointment["id"], 0) == 0
        # Patient sends 3 new messages
        for i in range(3):
            r = chat_http.post(
                f"{API}/appointments/{chat_appointment['id']}/messages",
                headers=auth_headers(chat_patient["token"]),
                json={"text": f"TEST unread msg {i}"},
            )
            assert r.status_code == 200
        # Doctor's unread count should be exactly 3 for this appointment
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_doctor["token"]))
        assert r.status_code == 200
        assert r.json().get(chat_appointment["id"]) == 3

    def test_unread_reflects_new_doctor_messages_on_patient_side(
        self, chat_http, chat_patient, chat_doctor, chat_appointment
    ):
        # Baseline: patient reads current thread so unread=0
        chat_http.get(
            f"{API}/appointments/{chat_appointment['id']}/messages",
            headers=auth_headers(chat_patient["token"]),
        )
        # Doctor sends 2 new messages
        for i in range(2):
            r = chat_http.post(
                f"{API}/appointments/{chat_appointment['id']}/messages",
                headers=auth_headers(chat_doctor["token"]),
                json={"text": f"TEST doctor reply {i}"},
            )
            assert r.status_code == 200
        # Patient's unread count should be exactly 2
        r = chat_http.get(f"{API}/chat/unread", headers=auth_headers(chat_patient["token"]))
        assert r.status_code == 200
        assert r.json().get(chat_appointment["id"]) == 2
