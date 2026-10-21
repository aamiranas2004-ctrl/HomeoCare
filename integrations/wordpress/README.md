# HomeoCare booking verification deployment

Baseline: main `2566182`. This change does not deploy either service.

## Verification design

The trusted WordPress server receives an opaque 256-bit claim token from the booking API and sends it only to the submitted email address. MongoDB holds only its SHA-256 hash, version and 24-hour expiry. The email contains no health details. A link alone cannot claim: the patient must sign in through Google with exactly the normalized booking email and explicitly confirm. Evidence is attached to the actual Google session, so a phone session or an old Google session cannot claim merely because a profile has that email. Google must return `email_verified=true` and a subject. Email normalization trims whitespace and lowercases; no Gmail dot/plus alias merging.

The claim is one conditional MongoDB update checking token, version, email, expiry and unclaimed state, then deleting the hash. Concurrent/replayed claims fail with a generic message. GET/navigation never consumes the token. The app removes it from its URL and retains it in tab-scoped sessionStorage across Google redirects, clearing it on success/dismissal. New emails use a URL fragment to avoid server access logs. Do not add analytics that capture fragments, storage or API bodies. API responses use no-store; web pages use no-referrer.

Existing claimed requests and linked appointments are preserved without backfill or reassignment. Old **unclaimed** tokens fail closed (they had no expiry or verified-email binding). Clinic staff should handle those requests directly; this release has no public recovery/resend endpoint. No email lookup or public request-detail endpoint exists.

## Configure and deploy

1. Review and commit/deploy the backend and frontend together. On Render retain existing MongoDB, Google OAuth and `WEBSITE_FORM_SECRET` settings. No backend email provider is required. Do not print or commit credentials. Keep `ALLOW_DEV_OTP` unset and `TEST_OTP_PHONES` empty in production. Existing Google sessions must sign out and sign in again before claiming.
2. Build frontend with its existing `EXPO_PUBLIC_BACKEND_URL`; run `npx expo export --platform web` and deploy the generated web build through the existing process. Confirm `/appointments` routes correctly on reload and Google callback returns to the app origin. No database deletion/migration is needed; do not use a TTL index on appointment requests, since that would delete bookings.
3. Verify WordPress mail delivery to an inbox you control, including delivery failure handling. `wp_mail()` returning true only means accepted for sending, not inbox delivery. If mail is not configured, keep this adapter disabled and configure the site's mail provider/SMTP securely before enabling. Do not paste passwords/API keys into chat.
4. Install `homeocare-bookings.php` as a WordPress plugin (or mu-plugin). Disable/replace the previous HomeoCare submission hook to avoid duplicate bookings. In server-only WordPress configuration define `HC_FORM_ID` (the booking form ID), `HC_API_URL` (HTTPS backend origin), `HC_APP_URL` (HTTPS app origin), `HC_FORM_SECRET` (same value as Render), and set `HC_MAIL_VERIFIED` to boolean `true` only after delivery is verified. These are configuration names, not values to expose to browser scripts.
5. Add a `homeocare_booking_payload` filter returning `full_name`, `phone`, `email`, `health_concern`, `consultation_mode`, and optional `additional_information` from the **actual** SureForms field IDs. The adapter intentionally has no guessed field mapping. Inspect a synthetic entry securely, not real patient data in logs. Return null for unsupported forms/entries. SureForms documents `srfm_after_submission_process` with a raw `$form_data` argument and `form_id`: https://sureforms.com/docs/after-submission-process-action/ . Field mapping and the installed plugin version must be verified on staging.
6. Do not add the token to a SureForms response, confirmation page, entry metadata, analytics, or logs. The API creation response now contains only `id` and `claim_token`; update any older hook that expected the full booking. The adapter logs only generic failures. A failed transfer/mail needs administrator follow-up using the existing SureForms entry; there is no automatic retry or resend. Never replay a hook blindly, as it would create another request. The clinic can still manage a saved lead without a patient claim.

## Test before production enablement

Offline: install backend requirements plus `mongomock-motor`, then run from repository root:

```sh
PYTHONPATH=backend pytest backend/tests/test_claim_security.py -q
cd frontend
npx tsc --noEmit
npx expo export --platform web
```

Use synthetic staging accounts only. Submit a SureForms booking, verify only its email inbox receives the link, and confirm no patient details/token appear publicly. Verify:

- No sign-in: login required; opening/reloading/scanning the email does not consume it.
- Matching Google sign-in: explicit confirmation links exactly one booking; confirmed requests appear as appointments.
- Different Google account, phone-only session, expired token, random token, old unclaimed token, and second use: denied without booking details.
- Two simultaneous claims: exactly one succeeds. Signing in again with the right account after a mismatch can retry the still-unused link.
- Patient B cannot read/update patient A's appointment, consultation notes, messages, documents or website requests, even with known IDs. Unauthenticated requests return 401. Assigned doctor can use notes/chat; another doctor cannot.
- A preexisting linked booking still opens its same appointment, notes and chat with no duplicate or owner change. Confirming or changing status in the doctor console updates the same appointment.
- Delivered email, Google callback, both deployed revision/build, and the above live smoke checks are verified before describing this release as live. Render success alone does not validate the WordPress/frontend integration.

## Authorization audit

Appointments and their embedded consultation notes: detail requires appointment patient/doctor; edits require assigned doctor. Chat reads/sends require appointment participation; unread counts scope to the caller's appointments. Patient file listing/content and family uploads use account ownership; another patient cannot retrieve content or write a doctor reply. Website lists are patient-owner or doctor-role scoped. Patient profile/role routes do not accept arbitrary email/ownership fields. Linked synchronization now refuses to overwrite a canonical appointment belonging to another patient and preserves its notes and existing ID.

Existing policy: clinic doctors can list/read/reply to **all clinic documents**, and access the clinic patient directory, independent of appointments. This is role-based clinic access, not assigned-doctor-only access. If multiple unrelated clinicians are introduced, this needs a separate clinic/assignment policy before onboarding them. R2 remains private; content is fetched through authenticated backend authorization. No change here makes files public.

Limitations: actual WordPress field mapping, mail provider delivery, Render access, and production smoke tests are deployment work. The adapter cannot verify inbox delivery or transactional transfer across WordPress/MongoDB/email. The offline MongoDB double validates conditional filters but is not a substitute for concurrency testing against staging MongoDB. Google identity fields follow https://developers.google.com/identity/openid-connect/openid-connect .

## Validation recorded for this change

13 offline security tests passed. Expo web export passed. TypeScript reports nine existing errors in doctor console, patient profile, icon mappings and theme; the same errors were reproduced against baseline `2566182` using the same installed dependencies. PHP CLI is unavailable here, so PHP lint and real SureForms/mail tests remain required on staging.
