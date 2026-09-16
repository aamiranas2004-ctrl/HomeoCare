"""Backend API tests for Agrawal Homeo Hall clinic app."""
import io
import re
import uuid
import pytest
import requests
from conftest import auth_headers, API


# ---------------------------------------------------------------------------
# Health & site content
# ---------------------------------------------------------------------------
class TestHealthAndContent:
    def test_health(self, http, api):
        r = http.get(f"{api}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_site_content(self, http, api):
        r = http.get(f"{api}/site/content")
        assert r.status_code == 200
        data = r.json()
        for key in ("clinic", "doctor", "services", "why_us", "testimonials", "how_online_works"):
            assert key in data, f"missing key {key}"
        assert data["clinic"]["name"] == "Agrawal Homeo Hall"
        assert data["doctor"]["name"] == "Dr. Sonima Agrawal"
        assert isinstance(data["services"], list) and len(data["services"]) > 0

    def test_list_doctors(self, http, api):
        r = http.get(f"{api}/doctors")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) >= 1
        names = [d.get("name") for d in docs]
        assert "Dr. Sonima Agrawal" in names


# ---------------------------------------------------------------------------
# Auth: phone OTP flow
# ---------------------------------------------------------------------------
class TestAuthOtp:
    def test_otp_request_returns_dev_otp(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": "+919999123456"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert re.fullmatch(r"\d{6}", str(body.get("otp_dev", "")))

    def test_otp_verify_with_returned_otp_creates_user(self, http, api):
        phone = f"+91999{uuid.uuid4().int % 10000000:07d}"
        req = http.post(f"{api}/auth/otp/request", json={"phone": phone}).json()
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": req["otp_dev"], "name": "TEST X"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data and data["session_token"].startswith("tok_")
        assert data["user"]["phone"] == phone
        assert data["user"]["role"] == "patient"
        # Patient must get UHID
        assert re.fullmatch(r"AHH-\d{4}-\d{5}", data["user"]["uhid"]), data["user"]

    def test_otp_verify_invalid_otp_fails(self, http, api):
        phone = f"+91998{uuid.uuid4().int % 10000000:07d}"
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": "000000"})
        assert r.status_code == 401

    def test_universal_otp_works(self, http, api):
        phone = f"+91997{uuid.uuid4().int % 10000000:07d}"
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": "123456", "name": "TEST Universal"})
        assert r.status_code == 200
        assert r.json()["user"]["uhid"].startswith("AHH-")


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------
class TestSession:
    def test_me_with_token(self, http, api, patient_session):
        r = http.get(f"{api}/auth/me", headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200
        assert r.json()["user_id"] == patient_session["user"]["user_id"]

    def test_me_without_token_401(self, http, api):
        r = requests.get(f"{api}/auth/me")  # bare, no headers
        assert r.status_code == 401

    def test_me_with_bad_token_401(self, http, api):
        r = http.get(f"{api}/auth/me", headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_logout_invalidates(self, http, api):
        # Fresh patient just for logout, so we don't kill patient_session
        phone = f"+91996{uuid.uuid4().int % 10000000:07d}"
        body = http.post(f"{api}/auth/otp/verify",
                        json={"phone": phone, "otp": "123456", "name": "TEST Logout"}).json()
        token = body["session_token"]
        r = http.post(f"{api}/auth/logout", headers=auth_headers(token))
        assert r.status_code == 200
        r2 = http.get(f"{api}/auth/me", headers=auth_headers(token))
        assert r2.status_code == 401


# ---------------------------------------------------------------------------
# Doctor login (seeded user)
# ---------------------------------------------------------------------------
class TestDoctorLogin:
    def test_doctor_login_returns_existing_doctor(self, doctor_session):
        u = doctor_session["user"]
        assert u["role"] == "doctor"
        assert u["name"] == "Dr. Sonima Agrawal"
        assert u["phone"] == "+917294136264"


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
class TestAppointments:
    def test_create_appointment_patient(self, http, api, patient_session, doctor_session):
        payload = {
            "doctor_id": doctor_session["user"]["user_id"],
            "date": "2026-02-10",
            "time_slot": "10:00 AM",
            "mode": "online",
            "symptoms": "TEST headache",
        }
        r = http.post(f"{api}/appointments", json=payload,
                      headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["patient_id"] == patient_session["user"]["user_id"]
        assert data["doctor_id"] == doctor_session["user"]["user_id"]
        assert data["symptoms"] == "TEST headache"
        assert data["status"] == "pending"
        pytest.appt_id = data["id"]

    def test_create_appointment_unknown_doctor_404(self, http, api, patient_session):
        r = http.post(f"{api}/appointments",
                      json={"doctor_id": "user_notexistent", "date": "2026-02-10",
                            "time_slot": "11:00 AM", "mode": "in-clinic", "symptoms": "x"},
                      headers=auth_headers(patient_session["token"]))
        assert r.status_code == 404

    def test_doctor_cannot_create_appointment_403(self, http, api, doctor_session):
        r = http.post(f"{api}/appointments",
                      json={"doctor_id": doctor_session["user"]["user_id"], "date": "2026-02-10",
                            "time_slot": "11:00 AM", "mode": "in-clinic", "symptoms": "x"},
                      headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 403

    def test_appointments_mine_patient(self, http, api, patient_session):
        r = http.get(f"{api}/appointments/mine", headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert any(a["id"] == pytest.appt_id for a in rows)

    def test_appointments_mine_doctor(self, http, api, doctor_session):
        r = http.get(f"{api}/appointments/mine", headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert any(a["id"] == pytest.appt_id for a in rows)

    def test_get_appointment_permission(self, http, api, patient_session, doctor_session):
        # Owner (patient) can see
        r = http.get(f"{api}/appointments/{pytest.appt_id}",
                    headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200
        # Doctor participant can see
        r = http.get(f"{api}/appointments/{pytest.appt_id}",
                    headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200

    def test_get_appointment_forbidden_for_other_patient(self, http, api):
        # Create a totally different patient
        phone = f"+91995{uuid.uuid4().int % 10000000:07d}"
        other = http.post(f"{api}/auth/otp/verify",
                          json={"phone": phone, "otp": "123456"}).json()
        r = http.get(f"{api}/appointments/{pytest.appt_id}",
                    headers=auth_headers(other["session_token"]))
        assert r.status_code == 403

    def test_patch_appointment_doctor(self, http, api, doctor_session):
        r = http.patch(f"{api}/appointments/{pytest.appt_id}",
                       json={"consultation_notes": "TEST notes: mild migraine", "status": "completed"},
                       headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["consultation_notes"] == "TEST notes: mild migraine"
        assert data["status"] == "completed"

    def test_patch_appointment_by_patient_forbidden(self, http, api, patient_session):
        r = http.patch(f"{api}/appointments/{pytest.appt_id}",
                       json={"consultation_notes": "hack"},
                       headers=auth_headers(patient_session["token"]))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Files (upload / list / stream / reply)
# ---------------------------------------------------------------------------
class TestFiles:
    def test_upload_file_patient(self, api, patient_session):
        # Minimal valid PNG (1x1)
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
               b"\x00\x01\x01\x00\x1b\xb6\xee\x56\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        data = {"category": "prescription", "note": "TEST prescription"}
        r = requests.post(f"{API}/files/upload", files=files, data=data,
                          headers={"Authorization": f"Bearer {patient_session['token']}"},
                          timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["patient_id"] == patient_session["user"]["user_id"]
        assert body["category"] == "prescription"
        assert body["size"] > 0
        pytest.file_id = body["id"]
        pytest.storage_path = body["storage_path"]

    def test_doctor_cannot_upload_403(self, api, doctor_session):
        files = {"file": ("x.txt", io.BytesIO(b"abc"), "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files, data={"category": "other"},
                          headers={"Authorization": f"Bearer {doctor_session['token']}"},
                          timeout=30)
        assert r.status_code == 403

    def test_files_mine_patient(self, http, api, patient_session):
        r = http.get(f"{api}/files/mine", headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert any(f["id"] == pytest.file_id for f in rows)

    def test_files_mine_doctor_sees_all(self, http, api, doctor_session):
        r = http.get(f"{api}/files/mine", headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert any(f["id"] == pytest.file_id for f in rows)

    def test_files_for_patient_doctor(self, http, api, patient_session, doctor_session):
        pid = patient_session["user"]["user_id"]
        r = http.get(f"{api}/files/patient/{pid}",
                    headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        assert any(f["id"] == pytest.file_id for f in r.json())

    def test_files_for_patient_not_allowed_for_patient(self, http, api, patient_session):
        pid = patient_session["user"]["user_id"]
        r = http.get(f"{api}/files/patient/{pid}",
                    headers=auth_headers(patient_session["token"]))
        assert r.status_code == 403

    def test_file_content_owner(self, http, api, patient_session):
        r = http.get(f"{api}/files/{pytest.file_id}/content",
                    headers=auth_headers(patient_session["token"]))
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"\x89PNG")

    def test_file_content_doctor(self, http, api, doctor_session):
        r = http.get(f"{api}/files/{pytest.file_id}/content",
                    headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_patch_file_reply_doctor(self, http, api, doctor_session):
        r = http.patch(f"{api}/files/{pytest.file_id}/reply",
                      json={"doctor_reply": "TEST take Nux Vomica 30, twice a day"},
                      headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["doctor_reply"].startswith("TEST take Nux Vomica")
        assert data["status"] == "reviewed"

    def test_patch_file_reply_by_patient_forbidden(self, http, api, patient_session):
        r = http.patch(f"{api}/files/{pytest.file_id}/reply",
                      json={"doctor_reply": "hack"},
                      headers=auth_headers(patient_session["token"]))
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Doctor -> patients listing
# ---------------------------------------------------------------------------
class TestDoctorPatients:
    def test_doctor_patients_list(self, http, api, doctor_session, patient_session):
        r = http.get(f"{api}/doctor/patients", headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        me = next((p for p in rows if p["user_id"] == patient_session["user"]["user_id"]), None)
        assert me is not None
        assert "appointments_count" in me and "files_count" in me
        assert me["appointments_count"] >= 1
        assert me["files_count"] >= 1

    def test_doctor_patients_list_forbidden_for_patient(self, http, api, patient_session):
        r = http.get(f"{api}/doctor/patients", headers=auth_headers(patient_session["token"]))
        assert r.status_code == 403

    def test_doctor_patient_detail(self, http, api, doctor_session, patient_session):
        pid = patient_session["user"]["user_id"]
        r = http.get(f"{api}/doctor/patients/{pid}",
                    headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["patient"]["user_id"] == pid
        assert isinstance(data["appointments"], list)
        assert isinstance(data["files"], list)

    def test_doctor_patient_detail_unknown_404(self, http, api, doctor_session):
        r = http.get(f"{api}/doctor/patients/user_doesnotexist",
                    headers=auth_headers(doctor_session["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Unauthorized responses
# ---------------------------------------------------------------------------
class TestUnauthorized:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/auth/me"),
        ("POST", "/appointments"),
        ("GET", "/appointments/mine"),
        ("GET", "/files/mine"),
        ("GET", "/doctor/patients"),
    ])
    def test_no_bearer_returns_401(self, method, path):
        r = requests.request(method, f"{API}{path}", json={}, timeout=15)
        assert r.status_code == 401, f"{method} {path} -> {r.status_code}"
