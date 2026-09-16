"""Shared fixtures for backend tests."""
import os
import random
import requests
import pytest

# Use the public preview URL that the mobile client hits
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    # Fallback: read from frontend/.env (test env doesn't always have it)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except FileNotFoundError:
        pass
BASE_URL = (BASE_URL or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api():
    return API


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh_phone() -> str:
    # Fresh random Indian-format phone number
    return f"+9199999{random.randint(10000, 99999)}"


@pytest.fixture(scope="session")
def patient_session(http):
    """Create a fresh patient via OTP verify and return {token, user, phone}."""
    phone = _fresh_phone()
    r = http.post(f"{API}/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = http.post(f"{API}/auth/otp/verify",
                  json={"phone": phone, "otp": "123456", "name": "TEST Patient", "role": "patient"})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"token": body["session_token"], "user": body["user"], "phone": phone}


@pytest.fixture(scope="session")
def doctor_session(http):
    """Login as seeded doctor via +917294136264 with universal OTP."""
    phone = "+917294136264"
    r = http.post(f"{API}/auth/otp/verify",
                  json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"token": body["session_token"], "user": body["user"], "phone": phone}


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
