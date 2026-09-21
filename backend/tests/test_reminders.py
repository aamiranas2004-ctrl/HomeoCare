"""Prescription Reminders backend tests.

Covers GET/POST /api/reminders, PATCH /api/reminders/{id} toggling completed,
DELETE /api/reminders/{id}. Enforces patient-only role and family_member_id linkage.
"""
import random
import pytest
import requests
from datetime import datetime, timedelta, timezone

from conftest import API, auth_headers, _fresh_phone


def _iso_future(minutes: int = 60) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


# ---------------------------------------------------------------------------
# Fresh patient (dedicated to reminders suite to avoid cross-test pollution)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def rem_patient(http):
    phone = _fresh_phone()
    r = http.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200
    r = http.post(f"{API}/auth/otp/verify",
                  json={"phone": phone, "otp": "123456",
                        "name": "TEST Reminder Patient", "role": "patient"})
    assert r.status_code == 200
    b = r.json()
    return {"token": b["session_token"], "user": b["user"], "phone": phone}


@pytest.fixture(scope="module")
def other_patient(http):
    phone = _fresh_phone()
    r = http.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200
    r = http.post(f"{API}/auth/otp/verify",
                  json={"phone": phone, "otp": "123456",
                        "name": "TEST Other Rem Patient", "role": "patient"})
    assert r.status_code == 200
    b = r.json()
    return {"token": b["session_token"], "user": b["user"]}


# ---------------------------------------------------------------------------
# Basic CRUD
# ---------------------------------------------------------------------------
class TestRemindersCRUD:
    def test_fresh_account_returns_empty(self, http, rem_patient):
        r = http.get(f"{API}/reminders", headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 200
        assert r.json() == []

    def test_create_reminder_returns_full_object(self, http, rem_patient):
        payload = {
            "kind": "medication",
            "title": "TEST Take Arnica 30",
            "note": "TEST after breakfast",
            "remind_at": _iso_future(60),
        }
        r = http.post(f"{API}/reminders", json=payload,
                      headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        # Full Reminder shape
        for k in ("id", "patient_id", "kind", "title", "note", "remind_at",
                  "completed", "created_at"):
            assert k in body, f"missing key {k}"
        assert body["patient_id"] == rem_patient["user"]["user_id"]
        assert body["kind"] == "medication"
        assert body["title"] == "TEST Take Arnica 30"
        assert body["note"] == "TEST after breakfast"
        assert body["completed"] is False
        assert body["family_member_id"] is None
        assert body["family_member_name"] is None
        # Verify GET persistence
        g = http.get(f"{API}/reminders", headers=auth_headers(rem_patient["token"]))
        assert g.status_code == 200
        ids = [x["id"] for x in g.json()]
        assert body["id"] in ids

    def test_create_with_all_kinds(self, http, rem_patient):
        for kind in ("refill", "follow_up", "medication", "other"):
            r = http.post(f"{API}/reminders",
                          json={"kind": kind, "title": f"TEST {kind}",
                                "remind_at": _iso_future(30)},
                          headers=auth_headers(rem_patient["token"]))
            assert r.status_code == 200, f"{kind} => {r.text}"
            assert r.json()["kind"] == kind

    def test_create_with_family_member_populates_name(self, http, rem_patient):
        # add a family member
        fm_r = http.post(f"{API}/family",
                         json={"name": "TEST Priya", "relation": "spouse", "age": 32,
                               "gender": "female"},
                         headers=auth_headers(rem_patient["token"]))
        assert fm_r.status_code == 200, fm_r.text
        fm = fm_r.json()

        r = http.post(f"{API}/reminders",
                      json={"kind": "refill", "title": "TEST Refill for Priya",
                            "remind_at": _iso_future(120),
                            "family_member_id": fm["id"]},
                      headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["family_member_id"] == fm["id"]
        assert body["family_member_name"] == "TEST Priya"

    def test_create_with_foreign_family_member_returns_404(self, http, rem_patient, other_patient):
        # Add a family member on the OTHER patient's account
        fm_r = http.post(f"{API}/family",
                         json={"name": "TEST Foreign FM", "relation": "sibling"},
                         headers=auth_headers(other_patient["token"]))
        assert fm_r.status_code == 200
        foreign_fm_id = fm_r.json()["id"]

        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST foreign",
                            "remind_at": _iso_future(30),
                            "family_member_id": foreign_fm_id},
                      headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 404, r.text

    def test_toggle_completed(self, http, rem_patient):
        # create
        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST Toggle",
                            "remind_at": _iso_future(15)},
                      headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 200
        rid = r.json()["id"]
        assert r.json()["completed"] is False

        # first PATCH → true
        p1 = http.patch(f"{API}/reminders/{rid}",
                        headers=auth_headers(rem_patient["token"]))
        assert p1.status_code == 200, p1.text
        assert p1.json()["completed"] is True
        assert p1.json()["id"] == rid

        # second PATCH → false
        p2 = http.patch(f"{API}/reminders/{rid}",
                        headers=auth_headers(rem_patient["token"]))
        assert p2.status_code == 200
        assert p2.json()["completed"] is False

        # verify via GET
        g = http.get(f"{API}/reminders", headers=auth_headers(rem_patient["token"]))
        rec = next(x for x in g.json() if x["id"] == rid)
        assert rec["completed"] is False

    def test_patch_unknown_returns_404(self, http, rem_patient):
        r = http.patch(f"{API}/reminders/does-not-exist-xyz",
                       headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 404

    def test_patch_other_users_reminder_returns_404(self, http, rem_patient, other_patient):
        # Create reminder on other_patient
        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST other's",
                            "remind_at": _iso_future(45)},
                      headers=auth_headers(other_patient["token"]))
        assert r.status_code == 200
        foreign_id = r.json()["id"]

        # rem_patient tries to toggle
        p = http.patch(f"{API}/reminders/{foreign_id}",
                       headers=auth_headers(rem_patient["token"]))
        assert p.status_code == 404

    def test_delete_reminder_and_second_delete_404(self, http, rem_patient):
        r = http.post(f"{API}/reminders",
                      json={"kind": "other", "title": "TEST delete me",
                            "remind_at": _iso_future(10)},
                      headers=auth_headers(rem_patient["token"]))
        assert r.status_code == 200
        rid = r.json()["id"]

        d1 = http.delete(f"{API}/reminders/{rid}",
                         headers=auth_headers(rem_patient["token"]))
        assert d1.status_code == 200
        assert d1.json().get("success") is True

        # verify gone via GET
        g = http.get(f"{API}/reminders", headers=auth_headers(rem_patient["token"]))
        assert rid not in [x["id"] for x in g.json()]

        # second delete → 404
        d2 = http.delete(f"{API}/reminders/{rid}",
                         headers=auth_headers(rem_patient["token"]))
        assert d2.status_code == 404

    def test_delete_other_users_reminder_returns_404(self, http, rem_patient, other_patient):
        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST other's del",
                            "remind_at": _iso_future(5)},
                      headers=auth_headers(other_patient["token"]))
        assert r.status_code == 200
        foreign_id = r.json()["id"]
        d = http.delete(f"{API}/reminders/{foreign_id}",
                        headers=auth_headers(rem_patient["token"]))
        assert d.status_code == 404


# ---------------------------------------------------------------------------
# Role & auth enforcement
# ---------------------------------------------------------------------------
class TestRemindersAccessControl:
    def test_doctor_get_rejected_403(self, http, doctor_session):
        r = http.get(f"{API}/reminders", headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_doctor_post_rejected_403(self, http, doctor_session):
        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST doc post",
                            "remind_at": _iso_future(30)},
                      headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_doctor_patch_rejected_403(self, http, doctor_session):
        r = http.patch(f"{API}/reminders/any-id",
                       headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_doctor_delete_rejected_403(self, http, doctor_session):
        r = http.delete(f"{API}/reminders/any-id",
                        headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_missing_auth_get_returns_401(self, http):
        r = http.get(f"{API}/reminders")
        assert r.status_code == 401

    def test_missing_auth_post_returns_401(self, http):
        r = http.post(f"{API}/reminders",
                      json={"kind": "medication", "title": "TEST no auth",
                            "remind_at": _iso_future(10)})
        assert r.status_code == 401

    def test_missing_auth_patch_returns_401(self, http):
        r = http.patch(f"{API}/reminders/x")
        assert r.status_code == 401

    def test_missing_auth_delete_returns_401(self, http):
        r = http.delete(f"{API}/reminders/x")
        assert r.status_code == 401

    def test_invalid_token_returns_401(self, http):
        r = http.get(f"{API}/reminders",
                     headers={"Authorization": "Bearer tok_invalid_xxxxx"})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Ordering: reminders returned sorted by remind_at ascending
# ---------------------------------------------------------------------------
class TestRemindersOrdering:
    def test_returned_sorted_by_remind_at_asc(self, http):
        # fresh patient to have a clean list
        phone = _fresh_phone()
        http.post(f"{API}/auth/otp/request", json={"phone": phone})
        r = http.post(f"{API}/auth/otp/verify",
                      json={"phone": phone, "otp": "123456",
                            "name": "TEST Order Rem", "role": "patient"})
        tok = r.json()["session_token"]
        # create in shuffled order
        later = _iso_future(180)
        sooner = _iso_future(30)
        middle = _iso_future(90)
        for t, title in [(later, "TEST later"), (sooner, "TEST sooner"), (middle, "TEST middle")]:
            resp = http.post(f"{API}/reminders",
                             json={"kind": "medication", "title": title, "remind_at": t},
                             headers=auth_headers(tok))
            assert resp.status_code == 200

        g = http.get(f"{API}/reminders", headers=auth_headers(tok))
        assert g.status_code == 200
        titles = [x["title"] for x in g.json()]
        assert titles == ["TEST sooner", "TEST middle", "TEST later"], titles
