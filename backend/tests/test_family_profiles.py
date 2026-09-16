"""Backend API tests for Family Profiles feature (iteration 2).

Covers:
- GET/POST/PATCH/DELETE /api/family (patient only, 401 without bearer, 403 for doctor)
- UHID auto-generation for each family member, distinct from primary patient's UHID
- POST /api/appointments with family_member_id populates family fields
- POST /api/files/upload with family_member_id populates family fields
- GET /api/doctor/patients/{id} now includes family_members list
"""
import io
import re
import uuid
import pytest
import requests
from conftest import auth_headers, API


UHID_RE = re.compile(r"^AHH-\d{4}-\d{5}$")


def _fresh_patient(http):
    """Create a brand new patient (its own account) and return {token, user}."""
    phone = f"+91994{uuid.uuid4().int % 10000000:07d}"
    r = http.post(f"{API}/auth/otp/verify",
                  json={"phone": phone, "otp": "123456", "name": "TEST Family Head", "role": "patient"})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"token": body["session_token"], "user": body["user"], "phone": phone}


# ---------------------------------------------------------------------------
# Family endpoints (auth, RBAC, CRUD)
# ---------------------------------------------------------------------------
class TestFamilyEndpointsAuth:
    def test_list_family_no_bearer_401(self):
        r = requests.get(f"{API}/family", timeout=15)
        assert r.status_code == 401

    def test_post_family_no_bearer_401(self):
        r = requests.post(f"{API}/family", json={"name": "X"}, timeout=15)
        assert r.status_code == 401

    def test_patch_family_no_bearer_401(self):
        r = requests.patch(f"{API}/family/nope", json={"name": "X"}, timeout=15)
        assert r.status_code == 401

    def test_delete_family_no_bearer_401(self):
        r = requests.delete(f"{API}/family/nope", timeout=15)
        assert r.status_code == 401

    def test_doctor_cannot_list_family_403(self, http, doctor_session):
        r = http.get(f"{API}/family", headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_doctor_cannot_create_family_403(self, http, doctor_session):
        r = http.post(f"{API}/family", json={"name": "TEST X"},
                      headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403


class TestFamilyCRUD:
    def test_list_family_initially_empty(self, http):
        """A brand new patient should have zero family members."""
        p = _fresh_patient(http)
        r = http.get(f"{API}/family", headers=auth_headers(p["token"]))
        assert r.status_code == 200
        assert r.json() == []

    def test_create_family_generates_unique_uhid(self, http):
        p = _fresh_patient(http)
        primary_uhid = p["user"].get("uhid")
        assert primary_uhid and UHID_RE.match(primary_uhid)

        payload = {"name": "TEST Spouse", "relation": "spouse", "age": 30,
                   "gender": "female", "blood_group": "O+",
                   "allergies": "penicillin, dust"}
        r = http.post(f"{API}/family", json=payload, headers=auth_headers(p["token"]))
        assert r.status_code == 200, r.text
        m = r.json()

        # Fields persisted
        assert m["name"] == payload["name"]
        assert m["relation"] == payload["relation"]
        assert m["age"] == payload["age"]
        assert m["gender"] == payload["gender"]
        assert m["blood_group"] == payload["blood_group"]
        assert m["allergies"] == payload["allergies"]
        assert m["account_id"] == p["user"]["user_id"]
        # UHID format & uniqueness vs primary
        assert UHID_RE.match(m["uhid"]), m
        assert m["uhid"] != primary_uhid

        # GET returns it
        r2 = http.get(f"{API}/family", headers=auth_headers(p["token"]))
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert m["id"] in ids

    def test_multiple_family_members_have_distinct_uhids(self, http):
        p = _fresh_patient(http)
        uhids = {p["user"]["uhid"]}
        for i, rel in enumerate(["child", "child", "parent"]):
            r = http.post(f"{API}/family",
                          json={"name": f"TEST Member {i}", "relation": rel, "age": 10 + i},
                          headers=auth_headers(p["token"]))
            assert r.status_code == 200, r.text
            uhid = r.json()["uhid"]
            assert UHID_RE.match(uhid)
            assert uhid not in uhids, f"UHID collision {uhid}"
            uhids.add(uhid)

    def test_patch_family_updates_fields(self, http):
        p = _fresh_patient(http)
        created = http.post(f"{API}/family",
                            json={"name": "TEST Kid", "relation": "child", "age": 5},
                            headers=auth_headers(p["token"])).json()
        mid = created["id"]

        r = http.patch(f"{API}/family/{mid}",
                       json={"name": "TEST Kid Updated", "relation": "child",
                             "age": 6, "gender": "male", "blood_group": "A+",
                             "allergies": "peanuts"},
                       headers=auth_headers(p["token"]))
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["name"] == "TEST Kid Updated"
        assert upd["age"] == 6
        assert upd["gender"] == "male"
        assert upd["blood_group"] == "A+"
        assert upd["allergies"] == "peanuts"
        # id and UHID unchanged
        assert upd["id"] == mid
        assert upd["uhid"] == created["uhid"]

    def test_patch_family_unknown_id_404(self, http):
        p = _fresh_patient(http)
        r = http.patch(f"{API}/family/does-not-exist",
                       json={"name": "TEST X"},
                       headers=auth_headers(p["token"]))
        assert r.status_code == 404

    def test_patch_family_of_another_user_404(self, http):
        # user A creates a family member
        a = _fresh_patient(http)
        created = http.post(f"{API}/family",
                            json={"name": "TEST A-Kid", "relation": "child"},
                            headers=auth_headers(a["token"])).json()
        # user B tries to patch it
        b = _fresh_patient(http)
        r = http.patch(f"{API}/family/{created['id']}",
                       json={"name": "TEST hijack"},
                       headers=auth_headers(b["token"]))
        assert r.status_code == 404

    def test_delete_family_removes_member(self, http):
        p = _fresh_patient(http)
        created = http.post(f"{API}/family",
                            json={"name": "TEST To Delete", "relation": "sibling"},
                            headers=auth_headers(p["token"])).json()
        mid = created["id"]

        r = http.delete(f"{API}/family/{mid}", headers=auth_headers(p["token"]))
        assert r.status_code == 200
        assert r.json().get("success") is True

        # confirm gone
        remaining = http.get(f"{API}/family", headers=auth_headers(p["token"])).json()
        assert all(x["id"] != mid for x in remaining)

    def test_delete_family_unknown_404(self, http):
        p = _fresh_patient(http)
        r = http.delete(f"{API}/family/does-not-exist",
                        headers=auth_headers(p["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Appointments with family_member_id
# ---------------------------------------------------------------------------
class TestAppointmentsWithFamily:
    def test_appointment_with_family_member_populates_fields(self, http, doctor_session):
        p = _fresh_patient(http)
        fm = http.post(f"{API}/family",
                       json={"name": "TEST Appt Spouse", "relation": "spouse", "age": 32},
                       headers=auth_headers(p["token"])).json()

        payload = {
            "doctor_id": doctor_session["user"]["user_id"],
            "date": "2026-03-01", "time_slot": "11:00 AM",
            "mode": "in-clinic", "symptoms": "TEST family appt",
            "family_member_id": fm["id"],
        }
        r = http.post(f"{API}/appointments", json=payload,
                      headers=auth_headers(p["token"]))
        assert r.status_code == 200, r.text
        appt = r.json()
        assert appt["family_member_id"] == fm["id"]
        assert appt["family_member_name"] == "TEST Appt Spouse"
        assert appt["family_member_relation"] == "spouse"
        # patient info still populated on self
        assert appt["patient_id"] == p["user"]["user_id"]

    def test_appointment_without_family_member_null_fields(self, http, doctor_session):
        p = _fresh_patient(http)
        r = http.post(f"{API}/appointments",
                      json={"doctor_id": doctor_session["user"]["user_id"],
                            "date": "2026-03-02", "time_slot": "12:00 PM",
                            "mode": "online", "symptoms": "TEST self"},
                      headers=auth_headers(p["token"]))
        assert r.status_code == 200, r.text
        appt = r.json()
        assert appt.get("family_member_id") is None
        assert appt.get("family_member_name") is None
        assert appt.get("family_member_relation") is None

    def test_appointment_with_unknown_family_member_404(self, http, doctor_session):
        p = _fresh_patient(http)
        r = http.post(f"{API}/appointments",
                      json={"doctor_id": doctor_session["user"]["user_id"],
                            "date": "2026-03-03", "time_slot": "01:00 PM",
                            "mode": "in-clinic", "symptoms": "TEST",
                            "family_member_id": "not-a-real-fm"},
                      headers=auth_headers(p["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# File upload with family_member_id
# ---------------------------------------------------------------------------
_PNG_1x1 = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
            b"\x00\x01\x01\x00\x1b\xb6\xee\x56\x00\x00\x00\x00IEND\xaeB`\x82")


class TestFilesWithFamily:
    def test_upload_with_family_member(self, http):
        p = _fresh_patient(http)
        fm = http.post(f"{API}/family",
                       json={"name": "TEST File Child", "relation": "child", "age": 8},
                       headers=auth_headers(p["token"])).json()

        files = {"file": ("kid_rx.png", io.BytesIO(_PNG_1x1), "image/png")}
        data = {"category": "prescription", "note": "TEST kid rx",
                "family_member_id": fm["id"]}
        r = requests.post(f"{API}/files/upload", files=files, data=data,
                          headers={"Authorization": f"Bearer {p['token']}"},
                          timeout=60)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["family_member_id"] == fm["id"]
        assert rec["family_member_name"] == "TEST File Child"
        assert rec["family_member_relation"] == "child"
        assert rec["patient_id"] == p["user"]["user_id"]

    def test_upload_with_unknown_family_member_404(self, http):
        p = _fresh_patient(http)
        files = {"file": ("x.png", io.BytesIO(_PNG_1x1), "image/png")}
        data = {"category": "prescription", "note": "TEST",
                "family_member_id": "nope-fm"}
        r = requests.post(f"{API}/files/upload", files=files, data=data,
                          headers={"Authorization": f"Bearer {p['token']}"},
                          timeout=60)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Doctor sees family_members on patient detail
# ---------------------------------------------------------------------------
class TestDoctorPatientDetailFamily:
    def test_patient_detail_includes_empty_family(self, http, doctor_session):
        p = _fresh_patient(http)
        r = http.get(f"{API}/doctor/patients/{p['user']['user_id']}",
                     headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "family_members" in data
        assert data["family_members"] == []

    def test_patient_detail_includes_family_members(self, http, doctor_session):
        p = _fresh_patient(http)
        m1 = http.post(f"{API}/family",
                       json={"name": "TEST DPD Spouse", "relation": "spouse"},
                       headers=auth_headers(p["token"])).json()
        m2 = http.post(f"{API}/family",
                       json={"name": "TEST DPD Kid", "relation": "child", "age": 4},
                       headers=auth_headers(p["token"])).json()

        r = http.get(f"{API}/doctor/patients/{p['user']['user_id']}",
                     headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        data = r.json()
        fms = data["family_members"]
        assert isinstance(fms, list) and len(fms) == 2
        ids = {x["id"] for x in fms}
        assert m1["id"] in ids and m2["id"] in ids
        # Each family member exposes UHID + relation
        for x in fms:
            assert UHID_RE.match(x["uhid"]), x
            assert x["relation"] in ("spouse", "child")
