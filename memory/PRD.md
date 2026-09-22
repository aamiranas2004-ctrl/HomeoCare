# Agrawal Homeo Hall — Mobile App PRD

## Overview
Native mobile companion app for **agrawalhomeohall.com** (homeopathy clinic in Ranchi run by
Dr. Sonima Agrawal, BHMS). The app mirrors the website's content plus adds a patient/doctor
portal that the website itself does not have.

## Users
- **Patients** — book appointments, upload prescriptions / test results, view doctor replies.
- **Doctor** — view queue, manage patients, review uploads, add consultation notes & replies.

## Core Features (MVP shipped)
- Splash + hero login screen with website tagline and hero imagery.
- **Auth**: Phone/OTP (dev-mode OTP returned in response + universal `123456`) *and*
  Emergent-managed Google Sign-In. Role toggle (Patient / Doctor) on login.
- **UHID generation**: every patient user gets a unique `AHH-YYYY-NNNNN` on first login/role.
- **Patient tabs**: Home, Visits, Records, Profile.
  - Home mirrors the website: services, why-choose, doctor bio, stats, testimonials.
  - Quick actions: Book Visit, Upload Records, Doctor Replies, Call Clinic.
- **Book Appointment** flow: doctor pick → mode (in-clinic/online) → date (next 14 days)
  → time slot → symptoms → confirm.
- **Uploads**: camera / gallery / PDF → Emergent Object Storage → categorised (prescription,
  test result, other) → doctor replies shown inline.
- **Doctor tabs**: Queue, Patients, Records, Profile.
  - Queue: pending / confirmed / completed appointments, confirm, add notes, mark complete.
  - Patients: search by name / UHID, per-patient detail with visits + uploaded files, reply
    to any file with a prescription note.
  - Records: cross-patient view of all uploads with quick reply input.

## Tech
- Backend: FastAPI + Motor (Mongo). Storage via Emergent Managed Object Storage. Google Auth
  via Emergent (`/api/auth/session`). OTP is generated locally (dev mode).
- Frontend: Expo Router 57, expo-image, expo-image-picker, expo-document-picker,
  @react-native-vector-icons/ionicons, react-native-safe-area-context, expo-web-browser.
- Theme in `frontend/src/theme.ts` from `design_guidelines.json` (green `#059669` +
  blue `#2563EB` accents).

## Data model (MongoDB)
- `users`: `{user_id, email?, phone?, name, picture?, role, uhid?, ...}`
- `user_sessions`: `{session_token, user_id, expires_at (TTL)}`
- `appointments`: `{id, patient_id, patient_name, patient_uhid, doctor_id, doctor_name, date,
   time_slot, mode, symptoms, status, consultation_notes?, created_at}`
- `files`: `{id, patient_id, patient_name, patient_uhid, filename, storage_path,
   content_type, size, category, note, doctor_reply?, status, created_at}`
- `otp_codes`: transient phone→OTP records with 10-min expiry.

## Clinic doctor login (v4)
- The clinic's contact number `+91-7294136264` is the **only** phone allowed to hold the doctor role.
- Backend enforces this at every entry point: OTP signup and `POST /auth/role` silently downgrade any other number/email to `patient`. On startup we also demote any stray legacy doctor rows.
- The Login screen displays a soft hint when the "I'm a Doctor" chip is selected: "Doctor login is restricted to the clinic's registered number (+91-7294136264)."
- Logging in with either `+917294136264` or `+91-7294136264` (with dash) resolves to the seeded Dr. Sonima Agrawal user and drops the user straight into the Doctor tabs where all clinic-wide appointments are visible.

## Doctor Chat (v3)
- Every appointment gets its own private chat thread that both the patient (or the primary account on behalf of a family member) and the assigned doctor can access.
- **Endpoints**: `GET/POST /api/appointments/{id}/messages`, `GET /api/chat/unread` returns `{appointment_id: count}` for badge counts.
- Read receipts: fetching `/messages` auto-marks the opposite party's messages as read; the badge on the tab / card disappears.
- UI: patient sees a **Chat with doctor** button on every appointment card; doctor sees **Chat with patient** on every queue card. Both show the unread count inline. Full chat screen polls every 4 seconds and auto-scrolls.
- Permissions: only the two participants (appointment.patient_id and doctor_id) can read or send; anyone else gets 403. Missing bearer → 401. Empty / whitespace / >2000 chars → 400.

## ⚠️ PRE-PUBLISH SECURITY CHECKLIST (from security audit)
Before clicking Publish, do ALL of these in **Deployment Panel → Secrets**:
1. Set `MSG91_TEMPLATE_ID` = your DLT-approved MSG91 template id (and `MSG91_SENDER_ID` if approved).
2. **DELETE the `ALLOW_DEV_OTP` secret** (or set it to anything other than `1`). While it's on, the login code is echoed in the API response and anyone can log in as the doctor.
3. Optionally trim `TEST_OTP_PHONES` (the `123456` code only works for those two test numbers — safe to leave, but remove them if you don't need test logins).
4. After saving secrets → **Re-deploy**. Then verify: request OTP for any phone → response must contain no `otp_dev` field, and a real SMS should arrive.

Audit status: all code-level findings fixed (universal OTP gated to test phones, rate limits 5 req/hr + 6 fails/10min, CORS allowlist, Bearer-only file access, no query-string tokens). Launch is blocked ONLY until steps 1–2 above are done.

## Known simplifications (upgrade in later iterations)
- **MSG91 SMS OTP wired** ✅ with `AUTHKEY`. Waiting on user's DLT-approved
  `TEMPLATE_ID` — until then backend falls back to dev-mode OTP and the universal
  `123456` backup code. Switch is automatic when TEMPLATE_ID lands in `/app/backend/.env`.
- Single doctor seeded (Dr. Sonima). Multi-doctor is supported by the schema.
- No push notifications yet (must be requested by user; requires build).

## Family Profiles (v2)
- One account can manage bookings & records for multiple family members (spouse/child/parent/sibling/other).
- Each member has: name, relation, age, gender, blood group, allergies.
- **Each family member gets their own unique UHID** — auto-generated on add, checked for uniqueness against both primary users and other family entries.
- Book Appointment and Upload Records screens include a horizontal "Booking For" picker (Myself + all family members).
- Doctor's Patient Detail view now shows the patient's family members and their UHIDs; appointments/records display "For [member name] ([relation])" badges throughout the app.
- Endpoints: `GET/POST /api/family`, `PATCH/DELETE /api/family/{id}`. Passing `family_member_id` to `/api/appointments` or `/api/files/upload` (multipart) populates the family fields on the record.
