# Contract — the form, the service, and Avni

Everything the three parts agree on. Change this file first; code follows it.

## 1. `GET /api/form-config`

Returns the field spec the page renders, plus the registration-window state.

```jsonc
{
  "form": "launchpad-cohort",
  "cohort": "Cohort 4 – Eastern India",
  "open": true,                       // false → the page shows the closed screen
  "closesAt": "2026-09-25T23:59:59+05:30",
  "sections": [
    { "id": "contact", "title": "Contact information",
      "description": "The primary person representing your organisation.",
      "fields": [
        { "id": "email", "label": "Your email address", "type": "email", "required": true },
        { "id": "contactPhone", "label": "Primary contact mobile number (WhatsApp preferred)", "type": "phone", "required": true },
        { "id": "priorMisToolUse", "label": "Have you used any digital data collection or MIS tools before?",
          "type": "radio", "required": true,
          "options": ["Yes, currently using", "Yes, have used earlier", "Never used digital data collection/MIS tools"] }
      ] }
  ]
}
```

Field `type` ∈ `text` · `email` · `phone` · `number` · `notes` (multi-line, with optional `maxWords`) · `radio` · `select` · `checkbox` (single agreement box). A `radio`/`select` may set `"other": true`, which adds a free-text `<id>Other` field when the last option is chosen.

## 2. `POST /api/submit`

Plain field JSON keyed by field id — no concept names, no Avni shapes.

```jsonc
{
  "captchaToken": "…",                // reCAPTCHA v2 response; UAT accepts RECAPTCHA_BYPASS_TOKEN
  "_gotcha": "",                      // honeypot — must be empty
  "fields": {
    "email": "priya@abcfoundation.org",
    "contactName": "Priya Sharma",
    "organisationName": "ABC Foundation",
    "contactRole": "Program Manager",
    "contactPhone": "+919876543210",
    "website": "https://abcfoundation.org",
    "headquarters": "Bhubaneswar, Odisha",
    "foundationYear": 2012,
    "annualBudget": "INR 70,00,000",
    "priorMisToolUse": "Yes, have used earlier",
    "avniFamiliarity": "I have attended an Avni demo/webinar",
    "interventionName": "Tracking health outreach visits",
    "programOperationalSince": "2019",
    "anticipatedDuration": "3 more years",
    "fundingSecuredUntil": "March 2028",
    "currentChallenges": "…",
    "pilotUseCase": "…",
    "expectedFieldUsers": 20,
    "misTeam": "Yes",
    "dedicatedTeamMember": "Yes",
    "pricingUnderstood": "Yes",
    "paidPlanIntent": "I would like to discuss more",
    "referralSource": "NGO partner network",
    "referralSourceOther": "",
    "applicationAgreement": true,
    "privacyConsent": true
  }
}
```

### Responses

| HTTP | `code` | Body | What the page shows |
|---|---|---|---|
| 200 | `CREATED` | `{ "reference": "LP-3f9a1c2e" }` | success screen with the reference |
| 202 | `QUEUED` | `{ "reference": "LP-Q-7b2d4e10" }` | success screen with the reference — Avni was unreachable; the application is stored on the node and replayed by ops |
| 400 | `VALIDATION_FAILED` | `{ "fieldErrors": { "email": "Enter a valid email address" } }` | errors on the fields, scroll to the first |
| 400 | `CAPTCHA_FAILED` | — | reset the captcha, ask again |
| 403 | `REGISTRATION_CLOSED` | `{ "closesAt": "…" }` | closed screen |
| 429 | — (nginx) | — | "Too many attempts — try again in a minute" |
| 500 | `INTERNAL` | — | generic error, retry button |

Honeypot filled → 200 `CREATED` with a fake reference; nothing is stored.

## 3. `GET /healthz`

`{ "ok": true, "cohort": "…", "open": true, "tokenCached": false }` — never calls Avni.

## 4. What the service sends to Avni

Default API version (no `?version` parameter). Header `AUTH-TOKEN: <jwt>` from `POST /api/user/generateToken` `{ "username", "password" }` → `{ "token" }`.

```jsonc
// POST /api/subject
{ "External ID": "<email, trimmed, lower-cased, NFKC>",
  "Subject type": "Applicant",
  "Registration date": "<today, IST, YYYY-MM-DD>",
  "First name": "<organisationName>",
  "Address": "India",
  "observations": { /* registration concepts, §5 */ } }

// POST /api/programEnrolment
{ "External ID": "<subject External ID>::cohort-4",
  "Program": "Launchpad",
  "Subject external ID": "<subject External ID>",
  "Enrolment datetime": "<now, ISO 8601 with +05:30>",
  "observations": { "Cohort": "<COHORT env>", /* enrolment concepts, §5 */ },
  "exitObservations": {} }
```

Invariants the tests pin:

- `"observations"` is always present on both calls and `"exitObservations": {}` is always present on the enrolment — avni-server dereferences both without a null check and returns 500 otherwise.
- Both calls are upserts on `External ID`. The same email always maps to the same subject; the same email + cohort to the same enrolment.
- Coded answers are sent as the **answer name** exactly as configured in the App Designer; the form-config options and the concept answers are the same strings.
- Nothing user-entered decides the cohort.

## 5. Field → concept mapping

Concept names are an **API contract** with the App Designer: a rename mid-window fails every submission. Registration concepts live on the Applicant registration form; enrolment concepts on the "Launchpad Application" enrolment form.

| Field id | Type | Avni form | Concept name | Notes |
|---|---|---|---|---|
| `email` | email | Registration | Contact email | also the subject External ID |
| `contactName` | text | Registration | Contact person name | |
| `organisationName` | text | Registration | — | goes in `"First name"` (the subject's name) |
| `contactRole` | text | Registration | Contact role | |
| `contactPhone` | phone | Registration | Contact phone | PhoneNumber concept; E.164 |
| `website` | text | Registration | Organisation website | "Not available" allowed |
| `headquarters` | text | Registration | Headquarters | open question A: split into City + State? |
| `foundationYear` | number | Registration | Foundation year | 1800–current year |
| `annualBudget` | text | Registration | Annual budget | open question B: coded bands? |
| `privacyConsent` | checkbox | Registration | Consent to data use | stored as coded `Yes` |
| `priorMisToolUse` | radio | Enrolment | Prior MIS tool use | Yes, currently using · Yes, have used earlier · Never used digital data collection/MIS tools |
| `avniFamiliarity` | radio | Enrolment | Avni familiarity | I have attended an Avni demo/webinar · I have explored the Avni website, videos or case studies · I have heard about Avni but have not explored it in detail · I am completely new to Avni |
| `interventionName` | text | Enrolment | Intervention name | |
| `programOperationalSince` | text | Enrolment | Program operational since | |
| `anticipatedDuration` | text | Enrolment | Anticipated program duration | |
| `fundingSecuredUntil` | text | Enrolment | Funding secured until | |
| `currentChallenges` | notes | Enrolment | Current challenges | ≤200 words |
| `pilotUseCase` | notes | Enrolment | Pilot use case | ≤400 words |
| `expectedFieldUsers` | number | Enrolment | Expected field users | integer ≥ 1 |
| `misTeam` | radio | Enrolment | MIS/M&E team | Yes · No · No, Planning to recruit in next 3 months |
| `dedicatedTeamMember` | radio | Enrolment | Dedicated team member available | Yes · No |
| `pricingUnderstood` | radio | Enrolment | Pricing understood | Yes · No |
| `paidPlanIntent` | radio | Enrolment | Paid plan intent | Yes · No · I would like to discuss more |
| `referralSource` | radio (+other) | Enrolment | Referral source | Avni website · Samanvay / Avni team · NGO partner network · Social media (LinkedIn, Instagram,Twitter) · Tamuku · India Partner Network · Reference · Other |
| `referralSourceOther` | text | Enrolment | Referral source other | only when `referralSource` = Other |
| `applicationAgreement` | checkbox | Enrolment | Application agreement | stored as coded `Yes` |
| — | — | Enrolment | Cohort | from `COHORT`; coded, one answer per cohort |

## 6. Environment

Service: `AVNI_BASE_URL`, `AVNI_USERNAME`, `AVNI_PASSWORD`, `RECAPTCHA_SECRET`, `RECAPTCHA_BYPASS_TOKEN` (UAT only), `BUGSNAG_KEY`, `COHORT`, `REG_OPEN`, `REG_CLOSE`, `SUBJECT_TYPE`, `PROGRAM`, `ADDRESS`, `DEAD_LETTER_PATH`, `LOG_LEVEL`, `PORT`.
Web (build-time, public): `VITE_API_BASE`, `VITE_RECAPTCHA_SITEKEY`, `VITE_BUGSNAG_KEY`, `VITE_POSTHOG_KEY`. Never a secret in a `VITE_` variable.
