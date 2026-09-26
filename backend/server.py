"""
Agrawal Homeo Hall - Mobile App Backend
Full-stack FastAPI service for patient/doctor portal with:
- Direct Google OAuth + Phone OTP
- Role-based access (patient / doctor)
- UHID generation for patients
- Appointment booking
- Prescription / test result uploads via Cloudflare R2
- Doctor consultation notes / replies
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form, Depends
from fastapi.responses import Response, RedirectResponse
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import random
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from urllib.parse import urlencode, urlparse
from datetime import datetime, timedelta, timezone

import httpx
import requests
import boto3

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
APP_NAME = os.environ.get("APP_NAME", "agrawal-homeo-hall")

# Direct Google OAuth (server-side authorization-code flow)
GOOGLE_CLIENT_ID = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()
GOOGLE_REDIRECT_URI = (os.environ.get("GOOGLE_REDIRECT_URI") or "").strip()

# Cloudflare R2 private object storage
R2_BUCKET_NAME = (os.environ.get("R2_BUCKET_NAME") or "").strip()
R2_ENDPOINT_URL = (os.environ.get("R2_ENDPOINT_URL") or "").strip()
R2_ACCESS_KEY_ID = (os.environ.get("R2_ACCESS_KEY_ID") or "").strip()
R2_SECRET_ACCESS_KEY = (os.environ.get("R2_SECRET_ACCESS_KEY") or "").strip()
R2_REGION = (os.environ.get("R2_REGION") or "auto").strip()

# Clinic identity
CLINIC_DOCTOR_PHONE = "+917294136264"          # only phone allowed to log in as doctor
CLINIC_DOCTOR_PHONE_DISPLAY = "+91-7294136264"
CLINIC_DOCTOR_EMAIL = "agrawalhomeohall@gmail.com"
LEGACY_DOCTOR_EMAIL = "dr.sonima@agrawalhomeohall.com"
TEMP_DOCTOR_EMAILS: set[str] = set()  # no temporary doctor accounts enabled

# MSG91 SMS OTP config
MSG91_AUTHKEY = (os.environ.get("MSG91_AUTHKEY") or "").strip()
MSG91_TEMPLATE_ID = (os.environ.get("MSG91_TEMPLATE_ID") or "").strip()
MSG91_SENDER_ID = (os.environ.get("MSG91_SENDER_ID") or "").strip()
MSG91_DEFAULT_CC = (os.environ.get("MSG91_DEFAULT_COUNTRY_CODE") or "91").strip()
MSG91_ENABLED = bool(MSG91_AUTHKEY and MSG91_TEMPLATE_ID)

# Dev-mode OTP gate: when "1", the backend may echo OTPs in API responses for
# local preview testing. MUST be unset/removed in production.
ALLOW_DEV_OTP = os.environ.get("ALLOW_DEV_OTP") == "1"
# Comma-separated phones for which the universal test OTP 123456 works.
# Used only by automated tests; never add real numbers here.
TEST_OTP_PHONES = {p.strip() for p in (os.environ.get("TEST_OTP_PHONES") or "").split(",") if p.strip()}

# In-memory OTP rate limiting (single-process backend)
_otp_request_log: dict = {}   # phone -> [timestamps]
_otp_verify_fail: dict = {}   # phone -> [timestamps]

def _rate_ok(bucket: dict, key: str, limit: int, window_seconds: int) -> bool:
    now = datetime.now(timezone.utc).timestamp()
    stamps = [t for t in bucket.get(key, []) if now - t < window_seconds]
    if len(stamps) >= limit:
        bucket[key] = stamps
        return False
    stamps.append(now)
    bucket[key] = stamps
    return True

client = AsyncIOMotorClient(mongo_url)
db = client[DB_NAME]

app = FastAPI(title="Agrawal Homeo Hall API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Storage helpers (Cloudflare R2 via S3-compatible API)
# ---------------------------------------------------------------------------
_r2_client = None


def init_storage_sync():
    global _r2_client
    if _r2_client is not None:
        return _r2_client

    missing = [
        name for name, value in (
            ("R2_BUCKET_NAME", R2_BUCKET_NAME),
            ("R2_ENDPOINT_URL", R2_ENDPOINT_URL),
            ("R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID),
            ("R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing R2 configuration: {', '.join(missing)}")

    _r2_client = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name=R2_REGION,
    )
    # Verify credentials, endpoint, bucket access, and network restrictions
    # without exposing the bucket publicly.
    _r2_client.head_bucket(Bucket=R2_BUCKET_NAME)
    return _r2_client


def put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    client = init_storage_sync()
    client.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=path,
        Body=data,
        ContentType=content_type,
    )
    return {"path": path, "size": len(data)}


def get_object_sync(path: str) -> tuple[bytes, str]:
    client = init_storage_sync()
    response = client.get_object(Bucket=R2_BUCKET_NAME, Key=path)
    body = response["Body"].read()
    return body, response.get("ContentType", "application/octet-stream")

def delete_object_sync(path: str) -> None:
    client = init_storage_sync()
    client.delete_object(Bucket=R2_BUCKET_NAME, Key=path)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(BaseModel):
    user_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    name: str
    picture: Optional[str] = None
    role: Literal["patient", "doctor"] = "patient"
    uhid: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    specialization: Optional[str] = None  # doctor
    qualification: Optional[str] = None  # doctor
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GoogleCodeExchange(BaseModel):
    code: str


class PhoneOtpRequest(BaseModel):
    phone: str


class PhoneOtpVerify(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None
    address: Optional[str] = None
    role: Literal["patient", "doctor"] = "patient"


class RoleUpdate(BaseModel):
    role: Literal["patient", "doctor"]
    age: Optional[int] = None
    gender: Optional[str] = None
    address: Optional[str] = None


class AppointmentCreate(BaseModel):
    doctor_id: str
    date: str  # ISO date "YYYY-MM-DD"
    time_slot: str  # "10:00 AM"
    mode: Literal["in-clinic", "online"] = "in-clinic"
    symptoms: str = ""
    family_member_id: Optional[str] = None  # book on behalf of a family member


class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    patient_name: str
    patient_uhid: Optional[str] = None
    family_member_id: Optional[str] = None
    family_member_name: Optional[str] = None
    family_member_relation: Optional[str] = None
    doctor_id: str
    doctor_name: str
    date: str
    time_slot: str
    mode: str
    symptoms: str
    status: Literal["pending", "confirmed", "completed", "cancelled"] = "pending"
    consultation_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FileRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    patient_name: str
    patient_uhid: Optional[str] = None
    family_member_id: Optional[str] = None
    family_member_name: Optional[str] = None
    family_member_relation: Optional[str] = None
    filename: str
    storage_path: str
    content_type: str
    size: int
    category: Literal["prescription", "test_result", "other"] = "prescription"
    note: str = ""
    doctor_reply: Optional[str] = None
    status: Literal["pending_review", "reviewed"] = "pending_review"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConsultationNoteUpdate(BaseModel):
    consultation_notes: str
    status: Optional[Literal["pending", "confirmed", "completed", "cancelled"]] = None


class FileReplyUpdate(BaseModel):
    doctor_reply: str


class FamilyMemberCreate(BaseModel):
    name: str
    relation: Literal["self", "spouse", "child", "parent", "sibling", "other"] = "other"
    age: Optional[int] = None
    gender: Optional[Literal["male", "female", "other"]] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None


class FamilyMember(FamilyMemberCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_id: str  # primary account user_id
    uhid: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatMessageCreate(BaseModel):
    text: str


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    appointment_id: str
    sender_id: str
    sender_role: Literal["patient", "doctor"]
    sender_name: str
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read_by_doctor: bool = False
    read_by_patient: bool = False


class ReminderCreate(BaseModel):
    kind: Literal["refill", "follow_up", "medication", "other"] = "medication"
    title: str
    note: Optional[str] = ""
    remind_at: datetime  # ISO datetime — when the nudge is due
    family_member_id: Optional[str] = None


class Reminder(ReminderCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    family_member_name: Optional[str] = None
    completed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_role(role: str, user: dict) -> dict:
    if user.get("role") != role:
        raise HTTPException(status_code=403, detail=f"Requires {role} role")
    return user


# ---------------------------------------------------------------------------
# UHID generator
# ---------------------------------------------------------------------------
async def generate_uhid() -> str:
    year = datetime.now(timezone.utc).year
    # Count existing UHIDs to give sequential id
    while True:
        candidate = f"AHH-{year}-{random.randint(10000, 99999)}"
        existing_user = await db.users.find_one({"uhid": candidate}, {"_id": 0})
        existing_fam = await db.family_members.find_one({"uhid": candidate}, {"_id": 0})
        if not existing_user and not existing_fam:
            return candidate


async def ensure_user_defaults(user: dict) -> dict:
    """Populate UHID for patient users on first login."""
    if user.get("role") == "patient" and not user.get("uhid"):
        uhid = await generate_uhid()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"uhid": uhid}})
        user["uhid"] = uhid
    return user


# ---------------------------------------------------------------------------
# Startup / seed
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("uhid", unique=True, sparse=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.oauth_states.create_index("state", unique=True)
    await db.oauth_states.create_index("expires_at", expireAfterSeconds=0)
    await db.oauth_codes.create_index("code", unique=True)
    await db.oauth_codes.create_index("expires_at", expireAfterSeconds=0)
    await db.appointments.create_index("patient_id")
    await db.appointments.create_index("doctor_id")
    await db.files.create_index("patient_id")
    await db.family_members.create_index("account_id")
    await db.family_members.create_index("id", unique=True)
    await db.chat_messages.create_index("appointment_id")
    await db.chat_messages.create_index([("appointment_id", 1), ("created_at", 1)])
    await db.reminders.create_index("patient_id")
    await db.reminders.create_index([("patient_id", 1), ("remind_at", 1)])

    # Canonical doctor-account migration. Preserve the seeded doctor's user_id
    # so existing doctor-side references remain stable.
    canonical = await db.users.find_one({"email": CLINIC_DOCTOR_EMAIL}, {"_id": 0})
    legacy = await db.users.find_one({"email": LEGACY_DOCTOR_EMAIL}, {"_id": 0})

    if legacy:
        doctor_user_id = legacy["user_id"]
        if canonical and canonical["user_id"] != doctor_user_id:
            test_user_id = canonical["user_id"]

            # Explicitly delete R2 objects owned by the test-patient account
            # before removing their MongoDB metadata.
            test_files = await db.files.find(
                {"patient_id": test_user_id}, {"_id": 0, "storage_path": 1}
            ).to_list(500)
            for test_file in test_files:
                storage_path = test_file.get("storage_path")
                if storage_path:
                    try:
                        await run_in_threadpool(delete_object_sync, storage_path)
                    except Exception as e:
                        logger.error(f"R2 cleanup failed for {storage_path}: {e}")
                        raise RuntimeError("Doctor migration stopped because test R2 cleanup failed")

            # Remove test-patient records. Appointment-linked chat is removed by
            # appointment id so replies/messages cannot become orphaned.
            test_appts = await db.appointments.find(
                {"patient_id": test_user_id}, {"_id": 0, "id": 1}
            ).to_list(500)
            test_appt_ids = [a["id"] for a in test_appts]
            if test_appt_ids:
                await db.chat_messages.delete_many({"appointment_id": {"$in": test_appt_ids}})
            await db.files.delete_many({"patient_id": test_user_id})
            await db.family_members.delete_many({"account_id": test_user_id})
            await db.reminders.delete_many({"patient_id": test_user_id})
            await db.appointments.delete_many({"patient_id": test_user_id})
            await db.user_sessions.delete_many({"user_id": test_user_id})
            await db.oauth_codes.delete_many({"user_id": test_user_id})
            await db.users.delete_one({"user_id": test_user_id})
            logger.info("Removed previous test-patient account and its R2 objects")

        await db.users.update_one(
            {"user_id": doctor_user_id},
            {
                "$set": {
                    "email": CLINIC_DOCTOR_EMAIL,
                    "phone": CLINIC_DOCTOR_PHONE,
                    "name": "Dr. Sonima Agrawal",
                    "role": "doctor",
                    "specialization": "Homeopathic Physician",
                    "qualification": "BHMS",
                },
                "$unset": {"uhid": "", "address": ""},
            },
        )
        logger.info("Migrated clinic doctor to permanent Google login")
    elif canonical:
        doctor_user_id = canonical["user_id"]
        await db.users.update_one(
            {"user_id": doctor_user_id},
            {
                "$set": {
                    "phone": CLINIC_DOCTOR_PHONE,
                    "name": "Dr. Sonima Agrawal",
                    "role": "doctor",
                    "specialization": "Homeopathic Physician",
                    "qualification": "BHMS",
                },
                "$unset": {"uhid": "", "address": ""},
            },
        )
        logger.info("Confirmed permanent clinic doctor account")
    else:
        doctor_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": doctor_user_id,
            "email": CLINIC_DOCTOR_EMAIL,
            "phone": CLINIC_DOCTOR_PHONE,
            "name": "Dr. Sonima Agrawal",
            "picture": "https://agrawalhomeohall.com/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-11_17_26-AM-682x1024.png",
            "role": "doctor",
            "specialization": "Homeopathic Physician",
            "qualification": "BHMS",
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Seeded permanent clinic doctor Dr. Sonima Agrawal")

    # Demote every other doctor account except explicitly permitted temporary testers.
    demote_res = await db.users.update_many(
        {
            "role": "doctor",
            "user_id": {"$ne": doctor_user_id},
            "email": {"$nin": [CLINIC_DOCTOR_EMAIL, *TEMP_DOCTOR_EMAILS]},
        },
        {"$set": {"role": "patient"}},
    )
    if demote_res.modified_count:
        logger.info(f"Demoted {demote_res.modified_count} stray doctor account(s) to patient")

    # Initialize storage (non-fatal)
    try:
        await run_in_threadpool(init_storage_sync)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Storage init failed (will retry on demand): {e}")

    if MSG91_ENABLED:
        logger.info(f"MSG91 SMS OTP ENABLED (template={MSG91_TEMPLATE_ID[:6]}...) sender={MSG91_SENDER_ID or '(default)'}")
    elif ALLOW_DEV_OTP:
        logger.warning("MSG91 disabled and ALLOW_DEV_OTP=1 — dev-mode OTP echo active. REMOVE before production deploy.")
    else:
        reason = "no AUTHKEY" if not MSG91_AUTHKEY else "no TEMPLATE_ID (waiting on DLT approval)"
        logger.warning(f"MSG91 disabled ({reason}) and dev OTP off — phone login will return 503 until SMS is configured.")


# ---------------------------------------------------------------------------
# Health / static content
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Agrawal Homeo Hall API", "status": "ok"}


@api_router.get("/site/content")
async def site_content():
    """Static website content used by the mobile app (mirrors agrawalhomeohall.com)."""
    return {
        "clinic": {
            "name": "Agrawal Homeo Hall",
            "tagline": "Expert Homeopathic Care for Migraine, Thyroid, PCOS/PCOD, Skin Diseases & Family Health",
            "phone": "+91-7294136264",
            "whatsapp": "https://wa.me/917294136264",
            "consultation_fee": 400,
            "experience_years": 14,
            "happy_patients": 2000,
            "location": "Ranchi",
        },
        "doctor": {
            "name": "Dr. Sonima Agrawal",
            "qualification": "BHMS",
            "experience": "14+ Years",
            "photo_url": "https://agrawalhomeohall.com/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-11_17_26-AM-682x1024.png",
            "bio": (
                "Dr. Sonima Agrawal (BHMS) is a dedicated homeopathic physician committed to providing "
                "personalized and compassionate healthcare for patients of all ages. With over 14 years of "
                "clinical experience, she focuses on understanding the root cause of illness and creating "
                "individualized treatment plans tailored to each patient's unique needs."
            ),
            "areas": [
                "Migraine", "Thyroid disorders", "PCOS", "Skin diseases",
                "Allergies", "Asthma", "Hair fall", "Child health",
                "Digestive disorders", "Chronic health concerns",
            ],
        },
        "services": [
            {"title": "Migraine", "icon": "pulse", "desc": "Personalized homeopathic care to help reduce migraine frequency, severity, and improve overall quality of life."},
            {"title": "Thyroid", "icon": "medical", "desc": "Comprehensive care to support thyroid health, hormonal balance, and overall wellness."},
            {"title": "PCOS/PCOD & Infertility", "icon": "female", "desc": "Holistic treatment focused on hormonal balance and women's reproductive health."},
            {"title": "Arthritis & Joint issues", "icon": "walk", "desc": "Natural homeopathic care to support joint health, mobility and long-term comfort."},
            {"title": "Skin & Allergies", "icon": "sparkles", "desc": "Individualized care for healthier skin and long-term management of allergic conditions."},
            {"title": "Asthma & Respiratory", "icon": "cloud", "desc": "Comprehensive care focused on respiratory health and symptom management."},
            {"title": "Hair Fall / Alopecia", "icon": "cut", "desc": "Personalized treatment to reduce hair fall and promote healthier hair growth."},
            {"title": "Autoimmune diseases", "icon": "shield-checkmark", "desc": "Dedicated care aimed at improving quality of life and managing autoimmune concerns."},
            {"title": "Indigestion & Acidity", "icon": "restaurant", "desc": "Comprehensive care for gastrointestinal issues with a focus on lasting wellness."},
            {"title": "Kidney Stones", "icon": "water", "desc": "Natural support for kidney stone concerns and maintaining urinary tract health."},
            {"title": "Neurological Complaints", "icon": "flash", "desc": "Personalized homeopathic care to support neurological health and overall well-being."},
            {"title": "Child & Family Care", "icon": "people", "desc": "Gentle care specially designed for children and daily health issues for all age groups."},
        ],
        "why_us": [
            {"title": "Personalized Treatment", "desc": "Every patient receives a customized treatment plan."},
            {"title": "Root Cause Approach", "desc": "We address the underlying cause of health concerns."},
            {"title": "Experienced Care", "desc": "14+ years of compassionate clinical experience."},
            {"title": "Online Consultation", "desc": "Consult from anywhere through online appointments."},
            {"title": "Family Healthcare", "desc": "Care for children, women, adults and seniors."},
            {"title": "Patient-Centered Care", "desc": "We listen carefully and support your wellness journey."},
        ],
        "testimonials": [
            {"name": "Neha", "location": "Ranchi", "rating": 5, "text": "Absolutely the best homeopathic experience I've ever had. The doctor was gentle, patient, and made me feel completely at ease throughout my treatment."},
            {"name": "Manju", "location": "Jamshedpur", "rating": 5, "text": "I was nervous before my visit, but her professional care and clear explanations put me instantly at comfort. My health has never been better!"},
            {"name": "Kavita", "location": "Hazaribagh", "rating": 5, "text": "Her attention to detail and warm approach truly set her apart. Highly recommend."},
        ],
        "how_online_works": [
            {"step": 1, "title": "Contact Us", "desc": "Call or WhatsApp us to book your consultation."},
            {"step": 2, "title": "Share Your Concerns", "desc": "Tell us about your symptoms, medical history and health goals."},
            {"step": 3, "title": "Online Consultation", "desc": "Consult directly with Dr. Sonima Agrawal from home."},
            {"step": 4, "title": "Personalized Treatment", "desc": "Receive individualized treatment recommendations."},
        ],
    }


@api_router.get("/doctors")
async def list_doctors():
    docs = await db.users.find({"role": "doctor"}, {"_id": 0}).to_list(50)
    return docs


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
def _mint_session_token(user_id: str) -> dict:
    session_token = f"tok_{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    return {"session_token": session_token, "user_id": user_id, "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc)}


@api_router.get("/auth/google/login")
async def google_login(return_url: str):
    """Start direct Google OAuth and remember a short-lived, validated app return URL."""
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI):
        raise HTTPException(status_code=503, detail="Google login is not configured")

    parsed = urlparse(return_url)
    allowed = (
        parsed.scheme == "agrawalhomeohall"
        or (parsed.scheme in ("http", "https") and parsed.hostname in ("agrawalhomeohall.com", "www.agrawalhomeohall.com", "localhost", "127.0.0.1"))
    )
    if not allowed:
        raise HTTPException(status_code=400, detail="Invalid return URL")

    state = uuid.uuid4().hex + uuid.uuid4().hex
    await db.oauth_states.insert_one({
        "state": state,
        "return_url": return_url,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "created_at": datetime.now(timezone.utc),
    })
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@api_router.get("/auth/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Google redirects here. Exchange its code, create/find the user, then return a one-time app code."""
    if error:
        raise HTTPException(status_code=400, detail=f"Google authentication failed: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing Google authorization response")

    state_row = await db.oauth_states.find_one_and_delete({"state": state})
    if not state_row:
        raise HTTPException(status_code=400, detail="Invalid or already-used OAuth state")
    expires_at = state_row.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OAuth state expired")

    async with httpx.AsyncClient(timeout=20) as ac:
        token_resp = await ac.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code != 200:
            logger.warning("Google token exchange failed with status %s", token_resp.status_code)
            raise HTTPException(status_code=401, detail="Google token exchange failed")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="Google did not return an access token")
        user_resp = await ac.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Could not read Google profile")
        data = user_resp.json()

    email = (data.get("email") or "").strip().lower()
    if not email or data.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="A verified Google email is required")

    is_temp_doctor = email in TEMP_DOCTOR_EMAILS
    is_clinic_doctor = email == CLINIC_DOCTOR_EMAIL
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        updates = {}
        if data.get("name") and not existing.get("name"):
            updates["name"] = data["name"]
        if data.get("picture") and not existing.get("picture"):
            updates["picture"] = data["picture"]
        if (is_temp_doctor or is_clinic_doctor) and existing.get("role") != "doctor":
            updates["role"] = "doctor"
            updates["specialization"] = "Homeopathic Physician" if is_clinic_doctor else "Temporary doctor test account"
        if updates:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": "doctor" if (is_temp_doctor or is_clinic_doctor) else "patient",
            "specialization": "Homeopathic Physician" if is_clinic_doctor else ("Temporary doctor test account" if is_temp_doctor else None),
            "created_at": datetime.now(timezone.utc),
        })

    one_time_code = uuid.uuid4().hex + uuid.uuid4().hex
    await db.oauth_codes.insert_one({
        "code": one_time_code,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc),
    })
    separator = "&" if "?" in state_row["return_url"] else "?"
    return RedirectResponse(f'{state_row["return_url"]}{separator}' + urlencode({"auth_code": one_time_code}))


@api_router.post("/auth/google/exchange")
async def google_exchange(payload: GoogleCodeExchange):
    """Exchange the one-time app code for the app's normal seven-day session token."""
    row = await db.oauth_codes.find_one_and_delete({"code": payload.code})
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or already-used Google login code")
    expires_at = row.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Google login code expired")

    user_doc = await db.users.find_one({"user_id": row["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    user_doc = await ensure_user_defaults(user_doc)
    session_row = _mint_session_token(user_doc["user_id"])
    await db.user_sessions.insert_one({**session_row})
    return {"session_token": session_row["session_token"], "user": user_doc}

@api_router.post("/auth/otp/request")
async def request_otp(payload: PhoneOtpRequest):
    """Send an OTP to the user's phone.
    - If MSG91_AUTHKEY + MSG91_TEMPLATE_ID are configured → real SMS via MSG91.
    - Otherwise → dev mode: OTP is generated locally and returned in the response.
      The universal fallback OTP `123456` is always accepted.
    """
    # Normalise: MSG91 expects country code + national number without '+'
    raw = payload.phone.strip().replace(" ", "").replace("-", "")
    if raw.startswith("+"):
        digits = raw[1:]
    elif raw.startswith("00"):
        digits = raw[2:]
    else:
        # No CC given → prepend default (India)
        digits = raw if len(raw) > 10 else f"{MSG91_DEFAULT_CC}{raw}"
    if not digits.isdigit() or len(digits) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    stored_phone = f"+{digits}"

    # Rate limit: max 5 OTP requests per phone per hour
    if not _rate_ok(_otp_request_log, stored_phone, 5, 3600):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Try again later.")

    if MSG91_ENABLED:
        # Delegate OTP generation + SMS delivery to MSG91.
        try:
            params = {"template_id": MSG91_TEMPLATE_ID, "mobile": digits, "otp_length": 6}
            if MSG91_SENDER_ID:
                params["sender"] = MSG91_SENDER_ID
            resp = await run_in_threadpool(
                lambda: requests.post(
                    "https://control.msg91.com/api/v5/otp",
                    params=params,
                    headers={"authkey": MSG91_AUTHKEY, "Accept": "application/json"},
                    timeout=15,
                )
            )
            data = resp.json() if resp.headers.get("Content-Type", "").startswith("application/json") else {"raw": resp.text}
            if resp.status_code == 200 and str(data.get("type", "")).lower() == "success":
                # Mark this phone as awaiting MSG91 verification (no local OTP stored).
                await db.otp_codes.update_one(
                    {"phone": stored_phone},
                    {"$set": {
                        "phone": stored_phone,
                        "provider": "msg91",
                        "otp": None,
                        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
                    }},
                    upsert=True,
                )
                logger.info(f"MSG91 OTP sent to {stored_phone}")
                return {"success": True, "provider": "msg91",
                        "message": "OTP sent via SMS."}
            logger.warning(f"MSG91 send failed ({resp.status_code}): {data}. Falling back to dev OTP.")
        except Exception as e:
            logger.warning(f"MSG91 request error: {e}. Falling back to dev OTP.")

    # DEV / fallback path — only allowed when ALLOW_DEV_OTP=1 (local preview).
    if not ALLOW_DEV_OTP:
        logger.error(f"SMS provider unavailable and ALLOW_DEV_OTP is off; rejecting OTP request for {stored_phone}")
        raise HTTPException(status_code=503, detail="SMS service unavailable. Please try again later.")

    otp = f"{random.randint(100000, 999999)}"
    await db.otp_codes.update_one(
        {"phone": stored_phone},
        {"$set": {
            "phone": stored_phone,
            "provider": "dev",
            "otp": otp,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        }},
        upsert=True,
    )
    logger.info(f"DEV OTP for {stored_phone}: {otp}")
    return {"success": True, "provider": "dev", "otp_dev": otp,
            "message": "OTP sent (dev mode returns OTP)"}


@api_router.post("/auth/otp/verify")
async def verify_otp(payload: PhoneOtpVerify):
    # Normalise phone same way as request
    raw = payload.phone.strip().replace(" ", "").replace("-", "")
    if raw.startswith("+"):
        digits = raw[1:]
    elif raw.startswith("00"):
        digits = raw[2:]
    else:
        digits = raw if len(raw) > 10 else f"{MSG91_DEFAULT_CC}{raw}"
    stored_phone = f"+{digits}"

    row = await db.otp_codes.find_one({"phone": stored_phone}, {"_id": 0})
    valid = False

    # Rate limit: max 6 failed verify attempts per phone per 10 minutes
    if not _rate_ok(_otp_verify_fail, stored_phone, 6, 600):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    # Universal test OTP — ONLY for explicitly whitelisted test phone numbers.
    if payload.otp == "123456" and stored_phone in TEST_OTP_PHONES:
        valid = True

    if not valid and row:
        exp = row.get("expires_at")
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        expired = exp and exp < datetime.now(timezone.utc)

        if not expired:
            if row.get("provider") == "msg91" and MSG91_ENABLED:
                # Verify via MSG91
                try:
                    resp = await run_in_threadpool(
                        lambda: requests.get(
                            "https://control.msg91.com/api/v5/otp/verify",
                            params={"otp": payload.otp, "mobile": digits},
                            headers={"authkey": MSG91_AUTHKEY, "Accept": "application/json"},
                            timeout=15,
                        )
                    )
                    data = resp.json() if resp.headers.get("Content-Type", "").startswith("application/json") else {}
                    if resp.status_code == 200 and str(data.get("type", "")).lower() == "success":
                        valid = True
                    else:
                        logger.info(f"MSG91 verify rejected for {stored_phone}: {data}")
                except Exception as e:
                    logger.warning(f"MSG91 verify error: {e}")
            elif row.get("otp") and row.get("otp") == payload.otp:
                valid = True

    if not valid:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")

    existing = await db.users.find_one({"phone": stored_phone}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        user_doc = existing
        # Backfill name/address on existing users when provided
        backfill = {}
        if payload.name and not existing.get("name"):
            backfill["name"] = payload.name
        if payload.address and not existing.get("address"):
            backfill["address"] = payload.address
        if backfill:
            await db.users.update_one({"user_id": user_id}, {"$set": backfill})
            user_doc.update(backfill)
    else:
        # Only the clinic's registered doctor phone may create a doctor account.
        # Any other phone attempting role=doctor is quietly downgraded to patient.
        desired_role = payload.role if (
            payload.role == "patient" or stored_phone == CLINIC_DOCTOR_PHONE
        ) else "patient"
        if not (payload.name or "").strip():
            raise HTTPException(status_code=400, detail="Name is required")
        if desired_role == "patient" and not (payload.address or "").strip():
            raise HTTPException(status_code=400, detail="Address is required")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "phone": stored_phone,
            "name": payload.name.strip(),
            "address": (payload.address or "").strip(),
            "role": desired_role,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one({**user_doc})

    user_doc = await ensure_user_defaults(user_doc)
    session_row = _mint_session_token(user_id)
    await db.user_sessions.insert_one({**session_row})
    await db.otp_codes.delete_one({"phone": stored_phone})
    return {"session_token": session_row["session_token"], "user": user_doc}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    user = await ensure_user_defaults(user)
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}


@api_router.post("/auth/role")
async def update_role(payload: RoleUpdate, user: dict = Depends(get_current_user)):
    """Set role after first Google login (patient/doctor).
    Only the clinic's registered doctor phone may be assigned the doctor role."""
    desired = payload.role
    if desired == "doctor" and user.get("phone") != CLINIC_DOCTOR_PHONE and \
            user.get("email") != CLINIC_DOCTOR_EMAIL:
        desired = "patient"
    update = {"role": desired}
    if payload.age is not None:
        update["age"] = payload.age
    if payload.gender:
        update["gender"] = payload.gender
    if payload.address is not None:
        update["address"] = payload.address
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    user.update(update)
    user = await ensure_user_defaults(user)
    return user


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------
@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(payload: AppointmentCreate, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    doctor = await db.users.find_one({"user_id": payload.doctor_id, "role": "doctor"}, {"_id": 0})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    fm_id = None
    fm_name = None
    fm_relation = None
    if payload.family_member_id:
        fm = await db.family_members.find_one(
            {"id": payload.family_member_id, "account_id": user["user_id"]}, {"_id": 0}
        )
        if not fm:
            raise HTTPException(status_code=404, detail="Family member not found")
        fm_id = fm["id"]
        fm_name = fm["name"]
        fm_relation = fm.get("relation")

    appt = Appointment(
        patient_id=user["user_id"],
        patient_name=user.get("name", ""),
        patient_uhid=user.get("uhid"),
        family_member_id=fm_id,
        family_member_name=fm_name,
        family_member_relation=fm_relation,
        doctor_id=doctor["user_id"],
        doctor_name=doctor["name"],
        date=payload.date,
        time_slot=payload.time_slot,
        mode=payload.mode,
        symptoms=payload.symptoms,
    )
    await db.appointments.insert_one(appt.dict())
    return appt


@api_router.get("/appointments/mine", response_model=List[Appointment])
async def my_appointments(user: dict = Depends(get_current_user)):
    if user.get("role") == "doctor":
        rows = await db.appointments.find({"doctor_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        rows = await db.appointments.find({"patient_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Appointment(**r) for r in rows]


@api_router.get("/appointments/{appt_id}", response_model=Appointment)
async def get_appointment(appt_id: str, user: dict = Depends(get_current_user)):
    row = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if user["user_id"] not in (row["patient_id"], row["doctor_id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return Appointment(**row)


@api_router.patch("/appointments/{appt_id}", response_model=Appointment)
async def update_appointment(appt_id: str, payload: ConsultationNoteUpdate,
                              user: dict = Depends(get_current_user)):
    await require_role("doctor", user)
    row = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if row["doctor_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {"consultation_notes": payload.consultation_notes}
    if payload.status:
        update["status"] = payload.status
    await db.appointments.update_one({"id": appt_id}, {"$set": update})
    row.update(update)
    return Appointment(**row)


# ---------------------------------------------------------------------------
# Chat (per-appointment thread)
# ---------------------------------------------------------------------------
async def _load_chat_appointment(appt_id: str, user: dict) -> dict:
    row = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if user["user_id"] not in (row["patient_id"], row["doctor_id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return row


@api_router.get("/appointments/{appt_id}/messages", response_model=List[ChatMessage])
async def list_messages(appt_id: str, user: dict = Depends(get_current_user)):
    appt = await _load_chat_appointment(appt_id, user)
    rows = await db.chat_messages.find({"appointment_id": appt_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # Mark other party's messages as read for the requesting side
    if user.get("role") == "doctor":
        await db.chat_messages.update_many(
            {"appointment_id": appt_id, "sender_role": "patient", "read_by_doctor": False},
            {"$set": {"read_by_doctor": True}},
        )
    else:
        await db.chat_messages.update_many(
            {"appointment_id": appt_id, "sender_role": "doctor", "read_by_patient": False},
            {"$set": {"read_by_patient": True}},
        )
    return [ChatMessage(**r) for r in rows]


@api_router.post("/appointments/{appt_id}/messages", response_model=ChatMessage)
async def send_message(appt_id: str, payload: ChatMessageCreate,
                        user: dict = Depends(get_current_user)):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text required")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    await _load_chat_appointment(appt_id, user)
    role = user.get("role", "patient")
    msg = ChatMessage(
        appointment_id=appt_id,
        sender_id=user["user_id"],
        sender_role=role,
        sender_name=user.get("name", ""),
        text=text,
        read_by_doctor=(role == "doctor"),
        read_by_patient=(role == "patient"),
    )
    await db.chat_messages.insert_one(msg.dict())
    return msg


@api_router.get("/chat/unread")
async def chat_unread_counts(user: dict = Depends(get_current_user)):
    """Return {appointment_id: unread_count} for the current user across their appointments."""
    role = user.get("role", "patient")
    field = "read_by_doctor" if role == "doctor" else "read_by_patient"
    opposite = "patient" if role == "doctor" else "doctor"

    query_appts = {"doctor_id" if role == "doctor" else "patient_id": user["user_id"]}
    appt_ids = [
        a["id"] for a in await db.appointments.find(query_appts, {"_id": 0, "id": 1}).to_list(500)
    ]
    if not appt_ids:
        return {}
    pipeline = [
        {"$match": {"appointment_id": {"$in": appt_ids}, "sender_role": opposite, field: False}},
        {"$group": {"_id": "$appointment_id", "count": {"$sum": 1}}},
    ]
    rows = await db.chat_messages.aggregate(pipeline).to_list(500)
    return {r["_id"]: r["count"] for r in rows}


# ---------------------------------------------------------------------------
# Files (prescription / test results)
# ---------------------------------------------------------------------------
@api_router.post("/files/upload", response_model=FileRecord)
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("prescription"),
    note: str = Form(""),
    family_member_id: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    await require_role("patient", user)
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"

    fm_name = None
    fm_relation = None
    fm_id = None
    if family_member_id:
        fm = await db.family_members.find_one(
            {"id": family_member_id, "account_id": user["user_id"]}, {"_id": 0}
        )
        if not fm:
            raise HTTPException(status_code=404, detail="Family member not found")
        fm_id = fm["id"]
        fm_name = fm["name"]
        fm_relation = fm.get("relation")

    try:
        result = await run_in_threadpool(put_object_sync, path, data, content_type)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=502, detail="Storage upload failed")

    record = FileRecord(
        patient_id=user["user_id"],
        patient_name=user.get("name", ""),
        patient_uhid=user.get("uhid"),
        family_member_id=fm_id,
        family_member_name=fm_name,
        family_member_relation=fm_relation,
        filename=file.filename or "file",
        storage_path=result["path"],
        content_type=content_type,
        size=result.get("size", len(data)),
        category=category if category in ("prescription", "test_result", "other") else "other",
        note=note,
    )
    await db.files.insert_one(record.dict())
    return record


@api_router.get("/files/mine", response_model=List[FileRecord])
async def my_files(user: dict = Depends(get_current_user)):
    if user.get("role") == "doctor":
        rows = await db.files.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        rows = await db.files.find({"patient_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [FileRecord(**r) for r in rows]


@api_router.get("/files/patient/{patient_id}", response_model=List[FileRecord])
async def files_for_patient(patient_id: str, user: dict = Depends(get_current_user)):
    await require_role("doctor", user)
    rows = await db.files.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [FileRecord(**r) for r in rows]


@api_router.get("/files/{file_id}/content")
async def file_content(file_id: str, user: dict = Depends(get_current_user)):
    row = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if user.get("role") != "doctor" and row["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        content, ctype = await run_in_threadpool(get_object_sync, row["storage_path"])
    except Exception as e:
        logger.error(f"Storage read failed: {e}")
        raise HTTPException(status_code=502, detail="Storage read failed")
    return Response(content=content, media_type=ctype or row.get("content_type", "application/octet-stream"))


@api_router.patch("/files/{file_id}/reply", response_model=FileRecord)
async def reply_file(file_id: str, payload: FileReplyUpdate, user: dict = Depends(get_current_user)):
    await require_role("doctor", user)
    row = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    update = {"doctor_reply": payload.doctor_reply, "status": "reviewed"}
    await db.files.update_one({"id": file_id}, {"$set": update})
    row.update(update)
    return FileRecord(**row)


# ---------------------------------------------------------------------------
# Doctor - patients list
# ---------------------------------------------------------------------------
@api_router.get("/doctor/patients")
async def doctor_patients(user: dict = Depends(get_current_user)):
    await require_role("doctor", user)
    rows = await db.users.find({"role": "patient"}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with appointment + file counts
    for r in rows:
        r["appointments_count"] = await db.appointments.count_documents({"patient_id": r["user_id"]})
        r["files_count"] = await db.files.count_documents({"patient_id": r["user_id"]})
    return rows


@api_router.get("/doctor/patients/{patient_id}")
async def doctor_patient_detail(patient_id: str, user: dict = Depends(get_current_user)):
    await require_role("doctor", user)
    patient = await db.users.find_one({"user_id": patient_id, "role": "patient"}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    appointments = await db.appointments.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    files = await db.files.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    family_members = await db.family_members.find({"account_id": patient_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return {"patient": patient, "appointments": appointments, "files": files, "family_members": family_members}


# ---------------------------------------------------------------------------
# Family Members
# ---------------------------------------------------------------------------
@api_router.get("/family", response_model=List[FamilyMember])
async def list_family(user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    rows = await db.family_members.find({"account_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return [FamilyMember(**r) for r in rows]


@api_router.post("/family", response_model=FamilyMember)
async def add_family(payload: FamilyMemberCreate, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    uhid = await generate_uhid()
    member = FamilyMember(
        account_id=user["user_id"],
        uhid=uhid,
        **payload.dict(),
    )
    await db.family_members.insert_one(member.dict())
    return member


@api_router.patch("/family/{member_id}", response_model=FamilyMember)
async def update_family(member_id: str, payload: FamilyMemberCreate, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    row = await db.family_members.find_one({"id": member_id, "account_id": user["user_id"]}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Family member not found")
    update = payload.dict()
    await db.family_members.update_one({"id": member_id}, {"$set": update})
    row.update(update)
    return FamilyMember(**row)


@api_router.delete("/family/{member_id}")
async def delete_family(member_id: str, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    res = await db.family_members.delete_one({"id": member_id, "account_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Family member not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Reminders (medication refills / follow-ups)
# ---------------------------------------------------------------------------
@api_router.get("/reminders", response_model=List[Reminder])
async def list_reminders(user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    rows = await db.reminders.find({"patient_id": user["user_id"]}, {"_id": 0}).sort("remind_at", 1).to_list(200)
    return [Reminder(**r) for r in rows]


@api_router.post("/reminders", response_model=Reminder)
async def add_reminder(payload: ReminderCreate, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    fm_name = None
    if payload.family_member_id:
        fm = await db.family_members.find_one(
            {"id": payload.family_member_id, "account_id": user["user_id"]}, {"_id": 0}
        )
        if not fm:
            raise HTTPException(status_code=404, detail="Family member not found")
        fm_name = fm["name"]

    rem = Reminder(
        patient_id=user["user_id"],
        family_member_name=fm_name,
        **payload.dict(),
    )
    await db.reminders.insert_one(rem.dict())
    return rem


@api_router.patch("/reminders/{rid}", response_model=Reminder)
async def toggle_reminder(rid: str, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    row = await db.reminders.find_one({"id": rid, "patient_id": user["user_id"]}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")
    new_state = not row.get("completed", False)
    await db.reminders.update_one({"id": rid}, {"$set": {"completed": new_state}})
    row["completed"] = new_state
    return Reminder(**row)


@api_router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user: dict = Depends(get_current_user)):
    await require_role("patient", user)
    res = await db.reminders.delete_one({"id": rid, "patient_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
app.include_router(api_router)

CORS_ORIGINS = [
    o.strip() for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()
] or [
    "https://homeo-appointments-6.preview.emergentagent.com",
    "http://localhost:8081",
    "http://localhost:19006",
]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
