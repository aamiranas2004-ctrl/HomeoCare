"""MSG91 dev-fallback + phone normalization tests (Iteration 3).

Context: MSG91_AUTHKEY is set in backend/.env but MSG91_TEMPLATE_ID is intentionally
empty (waiting on DLT approval). So the backend must:
  * Report provider='dev' on /auth/otp/request
  * Return `otp_dev` in the response
  * Accept both the returned otp_dev AND the universal fallback '123456'
  * Normalize phone: 10-digit → +91XXXXXXXXXX, '00' prefix stripped, '+' preserved
  * Reject invalid phones (letters, <10 digits) with 400
"""
import re
import uuid
import pytest
from conftest import auth_headers


# ---------------------------------------------------------------------------
# /auth/otp/request response shape (dev provider)
# ---------------------------------------------------------------------------
class TestOtpRequestDevProvider:
    def test_request_returns_provider_dev(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": "+919999123400"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("provider") == "dev", body
        assert re.fullmatch(r"\d{6}", str(body.get("otp_dev", ""))), body
        assert "message" in body

    def test_request_dev_message_mentions_fallback(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": "+919999123401"})
        assert r.status_code == 200
        msg = r.json().get("message", "")
        assert "123456" in msg


# ---------------------------------------------------------------------------
# Phone normalization
# ---------------------------------------------------------------------------
class TestPhoneNormalization:
    def _bare10(self) -> str:
        # 10-digit national Indian number, unique-ish
        return f"999{uuid.uuid4().int % 10000000:07d}"

    def test_bare_10_digit_gets_plus91(self, http, api):
        """Phone without country code → auto-prepend +91."""
        bare = self._bare10()
        r = http.post(f"{api}/auth/otp/request", json={"phone": bare})
        assert r.status_code == 200, r.text
        # Verify with universal OTP and check the persisted user.phone
        r2 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": bare, "otp": "123456", "name": "TEST Norm10"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["phone"] == f"+91{bare}"

    def test_double_zero_prefix_stripped(self, http, api):
        """'00' international prefix stripped and stored with '+'."""
        bare = self._bare10()
        phone_00 = f"0091{bare}"
        r = http.post(f"{api}/auth/otp/request", json={"phone": phone_00})
        assert r.status_code == 200, r.text
        r2 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": phone_00, "otp": "123456", "name": "TEST Norm00"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["phone"] == f"+91{bare}"

    def test_plus_prefix_retained(self, http, api):
        """Already-normalized '+91...' number → unchanged."""
        bare = self._bare10()
        phone = f"+91{bare}"
        r = http.post(f"{api}/auth/otp/request", json={"phone": phone})
        assert r.status_code == 200, r.text
        r2 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": phone, "otp": "123456", "name": "TEST Plus"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["phone"] == phone

    def test_spaces_and_dashes_stripped(self, http, api):
        """Whitespace / dashes should be stripped before normalization."""
        bare = self._bare10()
        formatted = f"+91 {bare[:5]}-{bare[5:]}"
        r = http.post(f"{api}/auth/otp/request", json={"phone": formatted})
        assert r.status_code == 200, r.text
        r2 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": formatted, "otp": "123456", "name": "TEST Spaces"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["phone"] == f"+91{bare}"


# ---------------------------------------------------------------------------
# Invalid phone rejection
# ---------------------------------------------------------------------------
class TestInvalidPhone:
    def test_letters_rejected_400(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": "+91abcdefghij"})
        assert r.status_code == 400
        assert r.json().get("detail") == "Invalid phone number"

    def test_too_short_rejected_400(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": "12345"})
        assert r.status_code == 400
        assert r.json().get("detail") == "Invalid phone number"

    def test_empty_string_rejected_400(self, http, api):
        r = http.post(f"{api}/auth/otp/request", json={"phone": ""})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Verify paths
# ---------------------------------------------------------------------------
class TestOtpVerifyPaths:
    def test_verify_with_returned_otp_dev(self, http, api):
        """The otp_dev from /request must verify successfully."""
        phone = f"+91993{uuid.uuid4().int % 10000000:07d}"
        req = http.post(f"{api}/auth/otp/request", json={"phone": phone}).json()
        assert req.get("provider") == "dev"
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": req["otp_dev"], "name": "TEST OtpDev"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["phone"] == phone

    def test_verify_universal_fallback_works(self, http, api):
        phone = f"+91992{uuid.uuid4().int % 10000000:07d}"
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": "123456", "name": "TEST Universal2"})
        assert r.status_code == 200, r.text

    def test_verify_wrong_otp_401(self, http, api):
        phone = f"+91991{uuid.uuid4().int % 10000000:07d}"
        http.post(f"{api}/auth/otp/request", json={"phone": phone})
        r = http.post(f"{api}/auth/otp/verify",
                      json={"phone": phone, "otp": "000000"})
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")


# ---------------------------------------------------------------------------
# /auth/me after normalized-phone login (regression for stored_phone form)
# ---------------------------------------------------------------------------
class TestAuthMeAfterNormalization:
    def test_me_after_bare_10_digit_login(self, http, api):
        bare = f"999{uuid.uuid4().int % 10000000:07d}"
        verify = http.post(f"{api}/auth/otp/verify",
                           json={"phone": bare, "otp": "123456", "name": "TEST MeNorm"}).json()
        token = verify["session_token"]
        r = http.get(f"{api}/auth/me", headers=auth_headers(token))
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["phone"] == f"+91{bare}"
        assert me["role"] == "patient"
        assert re.fullmatch(r"AHH-\d{4}-\d{5}", me["uhid"])

    def test_same_phone_two_formats_returns_same_user(self, http, api):
        """Login with '+91XXXX' then again with bare 'XXXX' → same user_id."""
        bare = f"999{uuid.uuid4().int % 10000000:07d}"
        v1 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": f"+91{bare}", "otp": "123456", "name": "TEST Idem"}).json()
        v2 = http.post(f"{api}/auth/otp/verify",
                       json={"phone": bare, "otp": "123456"}).json()
        assert v1["user"]["user_id"] == v2["user"]["user_id"]
