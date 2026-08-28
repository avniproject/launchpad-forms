# Launchpad on Avni

An end-to-end implementation guide for running Launchpad registration, screening, selection, and participation tracking on an Avni organisation — with a public registration form in front and Metabase dashboards behind.

Legend used throughout: **[Avni provides]** · **[You configure in Avni]** · **[You build]** · **[Optional]**

---

## Contents

1. [The big picture](#1--the-big-picture)
2. [Key design decisions](#2--key-design-decisions)
3. [The Avni data model](#3--the-avni-data-model)
4. [Phase 1 — Workflow design](#phase-1--workflow-design)
5. [Phase 2 — Organisation setup](#phase-2--organisation-setup)
6. [Phase 3 — Data model configuration](#phase-3--data-model-configuration)
7. [Phase 4 — Registration UI](#phase-4--registration-ui)
8. [Phase 5 — API integration](#phase-5--api-integration)
9. [Phase 6 — Internal workflow](#phase-6--internal-workflow-in-the-data-entry-app)
10. [Phase 7 — Metabase reporting](#phase-7--metabase-reporting)
11. [Phase 8 — Testing](#phase-8--testing-checklist)
12. [Phase 9 — Go-live](#phase-9--go-live-checklist)
13. [Risks & edge cases](#risks--edge-cases)
14. [Technology stack](#technology-stack-for-what-you-build)
15. [Phased plan & dependencies](#phased-plan-with-dependencies)
16. [Open decisions](#decisions-to-resolve-before-development-starts)

---

## 1 · The big picture

Avni's external API, Data Entry App, and Metabase integration cover almost everything Launchpad needs. Only **one** component has to be built from scratch: a small server-side proxy between the public form and the Avni API, because Avni has no anonymous/public form capability — every API call must carry an authenticated user's token, and that token must never live in a public web page.

```
Public registration page (static site, your domain)
        │  HTTPS + captcha
        ▼
Registration proxy (serverless function you build)
        │  POST /api/subject
        │  POST /api/programEnrolment
        │  AUTH-TOKEN header
        ▼
Avni server — Launchpad organisation
        │
        ▼
Subjects · Enrolments · Encounters (PostgreSQL, row-level security)
        ▲                                    │
        │  screening, selection,             │  hourly ETL to flat schema
        │  participation encounters          │  (one table per form)
        │                                    ▼
Launchpad team (Data Entry App)      Reporting schema ──► Metabase funnel dashboards
```

| Component | Who supplies it | What it does |
|---|---|---|
| **Public registration page** | You build (a form, no backend logic) | Collects the application. A standalone React (Vite) site in its own repo, styled like avniproject.org/signup, on its own S3 + CloudFront. Holds *no* credentials. |
| **Registration proxy** | You build (~200 lines) | Validates input, verifies captcha, authenticates to Avni as a locked-down integration user, calls the Avni API, retries on failure, sends the confirmation email. |
| **Avni organisation** | Avni provides; you configure | System of record. Subject types, programs, encounter types, forms, concepts, users, groups, locations — all configured in the App Designer, no code. |
| **External API** (`/api/*`) | Avni provides | Documented, idempotent REST endpoints for creating subjects, enrolments, and encounters. [API guide](https://avni.readme.io/docs/api-guide) · [Swagger spec](https://editor.swagger.io/?url=https://raw.githubusercontent.com/avniproject/avni-server/master/avni-server-api/src/main/resources/api/external-api.yaml). |
| **Data Entry App** | Avni provides | Web app where your team searches applicants, records screening/selection encounters, and tracks progress. No field app needed for this use case. |
| **ETL + reporting schema** | Avni provides | Hourly job flattens observations into one table per form (e.g. `applicant_launchpad_screening`) in an org-specific schema. This is what Metabase reads. |
| **Metabase** | Avni provides (self-service reports) | One-click setup creates the DB connection, permissions, and a canned dashboard; you then build the Launchpad funnel dashboards on top. |

**About `forms.avniproject.org`:** on Avni's hosted service, all organisations are served from the same web/app URLs — the org is selected by login, not by domain. The custom domain applies to your *public registration site* (the static form + proxy), which is exactly what the concept note proposes: host the Avni-branded registration page at `forms.avniproject.org`, submittable without any Avni login. Your team logs into the standard Avni URL.

---

## 2 · Key design decisions

These decisions shape everything downstream:

| Decision | Rationale |
|---|---|
| **One Avni organisation for Launchpad, shared across *all* cohorts** — never one per cohort | Launchpad data has nothing to do with any other org's data, and org-level isolation (users, forms, reports, RLS) is exactly right. But orgs are heavyweight: new users, new forms, new ETL schema, new Metabase setup each time. |
| **A cohort is a program *enrolment*** — one permanent `Launchpad` program, with "Cohort" as a coded observation on the enrolment | The single most important design decision: launching Cohort 5 needs only a new coded answer, dashboards get a cohort filter instead of being rebuilt, cross-cohort reporting is one `GROUP BY`, and a re-applicant is a second enrolment on the same Applicant with full history. |
| **Registration directly creates the Subject + program enrolment via the API**, in one proxy call | The API POST is idempotent, so this is safe. No manual import step, no latency, funnel reporting is live from day one. |
| **The journey is modelled as a Program** | Programs are Avni's construct for exactly this: a longitudinal journey with enrolment, staged encounters, and exit. Enrolment/exit dates and per-cohort separation come for free. |
| **No Excel/Google Sheets layer in the main flow**; CSV bulk upload kept as a manual fallback only | A sheet adds a manual sync step, a second source of truth, duplicate risk, and reporting lag — and solves nothing the API doesn't. Avni's bulk CSV upload remains available if the proxy is ever down. |
| **Integration layer is a thin proxy**, not Avni's integration service | Avni's integration service is built for ongoing two-way sync with systems like Bahmni. This need is one-way, one-shot creation — a serverless function (or n8n workflow, see Phase 5) is the right size. |
| **No special scalability work** | Even a wildly successful Launchpad cohort is a few thousand registrations; Avni orgs run programs with hundreds of thousands of subjects. The only real "scale" problem is spam, handled by captcha + rate limiting on the proxy. |
| **Security/privacy: four measures** | (1) Credentials only in the proxy, never the browser. (2) A least-privilege API user that can only register/enrol. (3) Explicit consent text + a DPDP-compliant privacy note on the form — the form collects PII. (4) Captcha + rate limiting. |

> **Design principle: An Applicant is permanent; a cohort attempt is an enrolment.** Everything you configure — forms, encounter types, dashboards, the registration proxy — is cohort-agnostic. Launching Cohort 5 becomes: add the coded answer, change one environment variable on the proxy, reopen the form.

---

## 3 · The Avni data model

Mapping every Avni construct to Launchpad:

| Avni construct | Launchpad instance | Reasoning |
|---|---|---|
| **Organisation** | `Avni Launchpad` (one, permanent) | Isolation boundary for users, data, and reporting. |
| **Subject type** | `Applicant`, type *Individual* | The applicant is an **organisation** (NGO / foundation / social enterprise — per the Cohort 4 signup form), not a person. *Individual* models a non-person entity: subject name = organisation name; the contact person's name/email/phone are observations. One row per organisation, across all cohorts. |
| **Registration form** | "Applicant Registration" | Captures who the organisation is: org type, contact person and their details, state. Cohort-agnostic — nothing about Cohort 4 in here. |
| **Program** | `Launchpad` (one, permanent) | The journey container. Enrolment = "applied to a cohort"; exit = left the funnel (rejected, withdrawn, completed). |
| **Enrolment form** | "Launchpad Application" | Cohort-specific answers: which cohort, the idea/proposal, motivation, how they heard of Launchpad. |
| **Program encounter types** | `Screening` · `Selection` · `Session` · `Milestone Review` · `Completion` | One encounter type per stage of the journey; each gets its own form and its own ETL table. |
| **Program exit form** | "Launchpad Exit" | One place to record leaving the funnel at any stage, with a coded "Exit reason" (Rejected at screening / Not selected / Withdrew / Dropped out / Completed). |
| **Concepts** | Email, Phone, Cohort, Screening decision, Selection decision, … | Reusable question definitions. Defined once, used across forms, become columns in reporting. |
| **Observations** | Every answer on every form | Stored as concept→value pairs on the registration/enrolment/encounter. |
| **Locations** | Single node: *India* | Minimal by decision — every subject registers against "India", hardcoded in the API call. Consequence: the address column carries no analytical signal, so any geographic breakdown (state/region dashboards) must come from a **State coded observation** on the registration form instead. |
| **User groups** | `Launchpad Team`, `Launchpad Admin`, `API Integration` | Least-privilege access; the API user's group can only register + enrol. |
| **Identifier source** [Optional] | Prefix `LP`, user-pool based | Human-friendly applicant IDs (LP000123) via a form field of concept type *Id*. |

### How "status" works — the one mental-model shift

Don't model status as a mutable field someone must remember to update. In Avni, **status is derived from what has happened**:

| Funnel status | Derived from |
|---|---|
| Registered | Enrolment exists, no Screening encounter yet |
| Screened — shortlisted | Screening encounter with `Screening decision = Shortlisted` |
| Screened — rejected | Screening encounter with `Screening decision = Rejected` (+ program exit, reason "Rejected at screening") |
| Selected | Selection encounter with `Selection decision = Selected` |
| Participating | Selected + ≥1 Session encounter |
| Completed | Completion encounter (+ program exit, reason "Completed") |
| Withdrew / dropped | Program exit with that reason, at any point |

This means no status field can ever disagree with the evidence, every status change carries its own form (who decided, when, why, scores), and the Metabase funnel is a set of simple `COUNT`s over encounter tables. If the team wants a visible status line on the applicant's profile in the Data Entry App, add a *subject summary rule* (JavaScript, configured on the subject type) that computes it from the same encounters — display logic, not stored state.

### Concept inventory

| Concept | Data type | Used in form | Notes |
|---|---|---|---|
| Contact person name | Text | Registration | The human to reach out to. |
| Contact email | Text | Registration | Your de-duplication key; validated by the proxy. |
| Contact phone | PhoneNumber | Registration | Built-in format validation. |
| Organisation type | Coded: NGO, Foundation, Social enterprise, Other | Registration | From the signup form's audience. |
| State | Coded (states/UTs) | Registration | Carries all geographic reporting, since the address is a single hardcoded "India". |
| Role / designation | Text | Registration | Contact person's role in the org. |
| Cohort | Coded: Cohort 4 – Eastern India, Cohort 5 – …, … | Enrolment | The reusability hinge. Cohorts are regional, so bake the region into the answer name. Add answers each cohort. |
| How did you hear about Launchpad | Coded | Enrolment | Marketing-channel reporting. |
| Proposal summary | Notes | Enrolment | Long text. |
| Consent to data use | Coded: Yes/No | Registration | Record consent as data, not just a checkbox pixel. |
| Screening decision | Coded: Shortlisted, Rejected, On hold | Screening | |
| Screening score | Numeric (with low/high range) | Screening | Rubric total; sub-scores can be a QuestionGroup. |
| Screening remarks | Notes | Screening | |
| Selection decision | Coded: Selected, Waitlisted, Not selected | Selection | |
| Session number / topic | Numeric / Coded | Session | One encounter per session attended. |
| Milestone status | Coded: On track, At risk, Stalled | Milestone Review | |
| Completion outcome | Coded: Completed, Partially completed | Completion | |
| Exit reason | Coded: Rejected at screening, Not selected, Withdrew, Dropped out, Completed | Exit | Makes attrition reportable from one column. |

---

## Phase 1 — Workflow design

- **What:** A one-page written definition of the participant journey: stages, the decision that moves someone between stages, who makes it, and the data captured at each step.
- **Why:** Every Avni artefact in Phases 2–3 is a direct transcription of this page. Ambiguity here becomes rework there.
- **Where:** A document, agreed with the Launchpad program team before touching Avni.
- **Do:** Walk one imaginary applicant end to end: *Priya registers on the website → appears in Data Entry App → Ravi screens her application against a rubric → shortlisted → panel selection call → selected → attends 6 sessions → milestone reviews → completes*. At each arrow, write down: trigger, decider, form fields, possible outcomes.
- **Output:** The stage table (statuses above), the concept inventory, and the screening rubric with score ranges.
- **Test:** Can every question in Phase 7's dashboards be answered from the captured fields? If "registrations by channel" is a KPI but no form asks the channel, fix it now.

---

## Phase 2 — Organisation setup

**[You configure in Avni]**

1. **Create the organisation.** On the hosted service, ask the Avni team to create org `Avni Launchpad` with a username suffix (e.g. `@launchpad`) and — critically — **analytics/ETL enabled** (this sets the org's `schema_name`, which the ETL job and Metabase depend on). Requesting this on day one means the reporting schema exists before you need it.
2. **Locations.** Admin app → Locations. Create one address-level type, *Country*, with a single location, *India*. Create one catchment, *All India*, containing it — every internal user (and the integration user) gets this catchment, so everyone sees all applicants. If state/region dashboards are wanted, add a *State* coded concept to the registration form — with a single location node, geography must be captured as an observation.
3. **User groups.** Admin app → User Groups. In the default `Everyone` group, turn *off* "All privileges" (privileges are cumulative across groups; leaving Everyone wide open makes your other groups meaningless). Then create:

   | Group | Privileges | Members |
   |---|---|---|
   | `Launchpad Admin` | All privileges + Analytics (Metabase access) | You, program lead |
   | `Launchpad Team` | View/Register/Edit subject on Applicant; Enrol/View/Edit enrolment on Launchpad; View/Schedule/Perform/Edit/Cancel visit on all five encounter types; Analytics for those who need Metabase | Screeners, ops team |
   | `API Integration` | **Only**: Register subject (Applicant) + Enrol subject (Launchpad). Nothing else. | The proxy's user only |

4. **Users.** Create human users (`ravi@launchpad`, …) in Launchpad Team, and one integration user `launchpad-api@launchpad` in API Integration with the "User" role. Log in as the integration user once in a browser to clear the forced password change — the API cannot answer that challenge.

**Test:** a Launchpad Team member can log into the Data Entry App and sees an empty applicant list; the API user logged into the web app can register but sees no admin menus.

---

## Phase 3 — Data model configuration

**[You configure in Avni]** — all in the App Designer, in this order (each step depends on the previous):

1. **Concepts first.** App Designer → Concepts. Create the concept inventory from Section 3. For coded concepts, create the answers exactly as you want them to appear in reports — answer names become the values in Metabase columns.
2. **Subject type.** Create `Applicant`, type *Individual* (the applicant is an organisation, so skip Person's gender/DOB built-ins; the subject's name holds the organisation name). Advanced settings: enable *Allow empty location* (belt-and-braces if a state is ever missing); leave *Unique name* off (contact email is your uniqueness key, enforced by the proxy). The registration form is created automatically — add your registration concepts to it in the form designer, grouped into pages ("Organisation details", "Contact person").
3. **Program.** Create `Launchpad`, mapped to Applicant. Build the "Launchpad Application" enrolment form (Cohort — required, How did you hear, Proposal summary) and the "Launchpad Exit" form (Exit reason — required, Exit remarks). In program settings, allow **multiple enrolments** so a Cohort-4 reject can apply to Cohort 5.
4. **Encounter types + forms.** Create the five program encounter types (Screening, Selection, Session, Milestone Review, Completion), each with its form from the concept inventory. Use form-level validation rules for anything structural (e.g. Screening decision is mandatory; score must be 0–100).
5. **Identifier source** [Optional]. Admin app → Identifier Source: user-pool based, prefix `LP`, then add an "Applicant ID" field (concept type *Id*) to the registration form.
6. **Search & lists.** In Organisation Config, add *custom search result fields* so Email and Phone show directly in Data Entry App search results — screeners will search by email constantly.
7. **Subject summary rule** [Optional but high-value]. On the Applicant subject type, add a summary rule that renders "Cohort 4 · Shortlisted · Screening score 78" at the top of the profile, computed from enrolments and encounters.

**Test:** in the Data Entry App, manually register a fake applicant, enrol them into Launchpad/Cohort 4, complete a Screening encounter, and exit them. If any step asks for a field you don't have, or is missing one, fix the forms now — *before* the API work bakes in the payload shape.

---

## Phase 4 — Registration UI

**Decision: the registration page posts to the proxy, which creates the subject and enrolment through the Avni API.** The alternative — a Google Form feeding a sheet, bulk-uploaded into Avni periodically — was considered and dropped:

| | Form → Google Sheet → Avni (not chosen) | Form → proxy → Avni API ✓ |
|---|---|---|
| Build effort | Near zero (Google Form + weekly CSV bulk upload) | Small: static form + ~200-line serverless function |
| Data latency | Whenever someone runs the import | Seconds; funnel dashboards live from day one |
| Duplicates | Manual de-dup in the sheet before every import | Automatic — idempotent API keyed on email |
| Failure handling | Silent: bad rows discovered at import time | Applicant sees an error and can retry; proxy retries/queues |
| Confirmation email | Google Forms' generic receipt | Branded, with the applicant's LP id |
| Source of truth | Two (sheet + Avni), which will drift | One |
| Cohort 5 reuse | Redo the sheet + mapping | Change one env var |

The sheet route's machinery — Avni's bulk CSV upload — stays in the back pocket as the manual fallback if the proxy is ever down during the registration window; it needs no extra work to remain available.

### Building the page to look like avniproject.org/signup

The reference design (`avniproject.org/signup/?source=trial`) is a Gatsby (React) page, but the Launchpad site is deliberately a **separate, standalone site in its own repo** — not a page inside avni-website. It lives at its own URL (`launchpad.avniproject.com` / `forms.avniproject.org`) with its own deployment, so Launchpad releases never touch the main website and the site can grow cohort pages of its own.

- **Build it as a small Vite + React app** (its own repo, e.g. `avni-launchpad-site`). Match the signup page's look by borrowing its visual language — the avni-website repo is open source, so lift the logo assets, teal palette, button and input styles, and header/footer markup from there into this repo's own components. You're copying the *look*, not sharing code or deployments.
- Gatsby would work too, but for a single-form site a full static-site-generator framework is overkill — Vite + React builds to the same static bundle with far less machinery. (Plain HTML/CSS/JS is also enough if nobody wants a build step.)
- Deploys to its own S3 bucket + CloudFront distribution with the custom domain (Route 53 + ACM), per the AWS hosting decision.

**Also significant:** the existing signup form already posts to an **n8n webhook** (`avniproject.app.n8n.cloud/webhook/avni-signup`) — Avni already operates the exact form → middleware pattern this plan calls a "proxy". See Phase 5: the Launchpad proxy can be a second n8n workflow instead of a new Lambda.

The page itself stays deliberately dumb: client-side validation for UX, a captcha widget, and one `POST` to the proxy. It never talks to Avni, never sees a token. Mirror the Avni registration + enrolment forms field-for-field so the proxy's mapping is 1:1.

---

## Phase 5 — API integration

**[You build]** — this is the heart of the custom work. Everything below is against Avni's *documented* external API ([API guide](https://avni.readme.io/docs/api-guide), [Swagger spec](https://editor.swagger.io/?url=https://raw.githubusercontent.com/avniproject/avni-server/master/avni-server-api/src/main/resources/api/external-api.yaml)) — not the internal web-app endpoints, which are explicitly not for integration.

### Two ways to run the proxy — pick based on team ownership

The website's trial-signup form already posts to an n8n webhook, so Avni operates n8n in production today. That makes the proxy a choice between:

- **Option 1 — a second n8n workflow (recommended for consistency):** webhook trigger → validate fields → HTTP node to Cognito for the token (`InitiateAuth`, `USER_PASSWORD_AUTH` — a plain HTTPS call with `X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth`, no SDK needed) → HTTP nodes for `POST /api/subject` and `POST /api/programEnrolment` → confirmation email via the n8n account's existing email setup (already used for previous cohorts — proven deliverability, nothing new to configure). n8n gives you the execution log, retries, and an error workflow (its dead-letter equivalent) out of the box, and whoever maintains the avni-signup workflow can maintain this one. At Launchpad volumes, re-authenticating to Cognito per submission is fine — no token cache needed.
- **Option 2 — AWS Lambda + API Gateway** as detailed below: more code, more control, same AWS account as everything else. Choose this if the team prefers versioned code over n8n workflows, or wants captcha verification and rate limiting done properly in one place (easier in code than in n8n).

Either way the contract is identical: the Gatsby page POSTs the form JSON to one URL; the proxy owns credentials, validation, the two Avni calls, failure handling, and the confirmation email. The Lambda details below apply conceptually to both.

### Authentication

Avni's hosted service uses AWS Cognito. The proxy signs in as the integration user and sends the resulting ID token in the `AUTH-TOKEN` header (the same header the Avni web app itself uses). Pool and client IDs are served by your Avni server at `GET /idp-details`.

```js
// registration-proxy: auth.js (Node)
import {
  CognitoIdentityProviderClient, InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";

let cached = { token: null, expiresAt: 0 };

export async function getAvniToken() {
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;
  const client = new CognitoIdentityProviderClient({ region: process.env.AVNI_REGION });
  const res = await client.send(new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.AVNI_COGNITO_CLIENT_ID,   // from GET /idp-details
    AuthParameters: {
      USERNAME: "launchpad-api@launchpad",
      PASSWORD: process.env.AVNI_API_PASSWORD
    }
  }));
  cached = {
    token: res.AuthenticationResult.IdToken,
    expiresAt: Date.now() + 50 * 60 * 1000          // tokens last ~1h; refresh at 50min
  };
  return cached.token;
}
```

### Creating the subject and enrolment

Two calls, in order (subject before enrolment — the API guide is explicit about processing order). Field names with spaces are literal — this is the documented contract. `observations` keys are your concept names; coded answers are the answer names.

```http
POST {AVNI_BASE_URL}/api/subject
AUTH-TOKEN: {token}
Content-Type: application/json

{
  "External ID": "priya.sharma@abcfoundation.org",
  "Subject type": "Applicant",
  "Registration date": "2026-09-01",
  "First name": "ABC Foundation",
  "Address": "India",
  "observations": {
    "Contact person name": "Priya Sharma",
    "Contact email": "priya.sharma@abcfoundation.org",
    "Contact phone": "9876543210",
    "Organisation type": "NGO",
    "Consent to data use": "Yes"
  }
}
```

Notes: "External ID" = normalized (trim + lowercase) contact email. For a non-person subject type the subject's name is passed in "First name" per the API contract — here it carries the organisation name. "Address" is hardcoded to `"India"` in the proxy (the single location node) — it must match the location name exactly.

```http
POST {AVNI_BASE_URL}/api/programEnrolment
AUTH-TOKEN: {token}

{
  "External ID": "priya.sharma@abcfoundation.org::cohort-4",
  "Program": "Launchpad",
  "Subject external ID": "priya.sharma@abcfoundation.org",
  "Enrolment datetime": "2026-09-01T10:23:00.000Z",
  "observations": {
    "Cohort": "Cohort 4 – Eastern India",
    "How did you hear about Launchpad": "Social media",
    "Proposal summary": "…"
  }
}
```

### Duplicates and double-submits — solved by one design choice

Avni's documented behaviour: **POST is idempotent** — it creates the entity if the External ID is new, updates it if it exists. So:

- **Same person submits twice** (double-click, refresh, "did it work?"): same email → same External IDs → the second call updates the same subject/enrolment. Zero duplicates, no code.
- **Cohort-4 reject applies to Cohort 5:** same subject External ID (updates the person), new enrolment External ID (`…::cohort-5`) → second enrolment on the same Applicant. Full history preserved — exactly what you want.
- **Same person, different email:** genuinely undetectable automatically. Mitigate with a periodic Metabase "possible duplicates" question on phone number, resolved manually (Avni supports voiding a subject).

### Failure handling

- **Validate before calling Avni** (email format, required fields, coded values in the allowed set) so Avni 4xx responses are rare and mean a bug, not user error.
- **Avni unreachable / 5xx:** retry 2–3× with backoff; if still failing, write the payload to a durable dead-letter store (a queue, or even one DynamoDB/Firestore row per failure) and show the applicant "Registration received — you'll get a confirmation email shortly." A small replay script re-POSTs the dead letters — idempotency makes replays always safe.
- **Tracking success:** the proxy logs every submission with outcome; the *system of record* check is a Metabase question — registrations per day — that ops eyeballs during the registration window. Send the confirmation email only after Avni returns 200, so "applicant got an email" ⇔ "subject exists in Avni".

### Security checklist for the proxy

- Avni password and Cognito client ID live only in the function's secret store; the browser sees nothing.
- The integration user's group grants *only* Register subject + Enrol — a leaked token can't read or modify anything else.
- Captcha (Cloudflare Turnstile or reCAPTCHA) verified server-side; rate-limit by IP; strict CORS allowing only your registration domain.
- HTTPS everywhere; consent recorded as an observation; registration closes by env-var date, enforced in the proxy, not just hidden in the UI.

### Migrating the existing Google Form responses

The Cohort 4 Google Form is already live and collecting applications (deadline Sep 25, 2026). Those responses must land in Avni too:

1. Export the Google Form responses sheet as CSV.
2. Write a small one-off script that maps each row to the same subject + enrolment payloads and POSTs them through the proxy (or directly to the Avni API with the integration user's token).
3. Because External IDs are keyed on contact email, the import is idempotent — anyone who applied on the Google Form *and* later registers on the new page dedupes automatically, and re-running the import is always safe.
4. Alternative zero-code path: transform the CSV into Avni's bulk-upload format and use the built-in CSV upload — fine for a single batch, but the API script reuses the mapping you've already written for the proxy.

If the new page launches mid-window, either redirect the Google Form to it, or keep both open and run the import script daily until the deadline.

**Test:** curl the proxy with a valid payload → subject + enrolment appear in the Data Entry App within seconds. Re-run the same curl → still exactly one subject. Kill the Avni URL in config → submission lands in the dead-letter store, replay script recovers it. Run the Google Form import twice → counts unchanged the second time.

---

## Phase 6 — Internal workflow in the Data Entry App

**[Avni provides]** — no build; this is your team's daily loop:

1. **Find work:** search Applicants (by name/email — the custom search fields from Phase 3), or filter to registrations with no Screening encounter yet. Pending-screening volume also sits on the Metabase ops dashboard.
2. **Open the applicant:** profile shows registration details, the Cohort 4 enrolment, the subject-summary status line, and completed/planned encounters.
3. **Screen:** on the enrolment, *New program encounter → Screening*; fill rubric scores, decision, remarks; save. If Rejected, also record the program *Exit* with reason "Rejected at screening".
4. **Select:** same pattern with the Selection encounter for shortlisted applicants; Not selected → exit "Not selected".
5. **Track participation:** one Session encounter per session attended; Milestone Reviews on cadence; Completion encounter + exit "Completed" at the end. Withdrawals at any point → exit with that reason.

Two optional Avni features if you want more process control: the **approval workflow** (a screener's encounter must be approved by an admin before it counts) — worth it only if you have many screeners and calibration concerns; and **subject assignment** (assign specific applicants to specific screeners) — useful if screening is divided up rather than pulled from a shared queue.

---

## Phase 7 — Metabase reporting

### How your data reaches Metabase

Because you enabled analytics in Phase 2, Avni's ETL job runs **hourly**, flattening JSONB observations into an org-specific reporting schema: one table per form, one column per concept. Your model produces, predictably:

| Table | Grain | Powers |
|---|---|---|
| `applicant` | One row per registered person | Total registrations, registrations over time / by state / by gender |
| `applicant_launchpad` | One row per enrolment (person × cohort) | The funnel's spine; cohort filter lives here |
| `applicant_launchpad_exit` | Exit date + reason per exited enrolment | Attrition analysis |
| `applicant_launchpad_screening` | One row per screening | Screened / shortlisted / rejected counts, score distributions, screener throughput |
| `applicant_launchpad_selection` | One row per selection decision | Selected / waitlisted / not-selected, selection rate |
| `applicant_launchpad_session` | One row per session attended | Participation, per-applicant attendance |
| `applicant_launchpad_milestone_review`, `…_completion` | One row per review / completion | Progress and completion rates |
| `address` | Location lookup | State names for joins |

This is why the data-model choices matter: **every dashboard below is a count or percentage over these tables, filtered by cohort**. Exact column names derive from your concept names — confirm them in Metabase's data browser (or the schema's `column_metadata`) before finalising SQL.

Setup is one click: Web console → Reports → Self-service → *Setup Reports* (creates the Metabase collection, DB connection, permissions, and a canned dashboard, in 15–30 min). Give teammates Metabase access by adding them to the Metabase user group / Analytics privilege; they get an activation email and a "Metabase Reports" entry from the Avni sign-in screen. Note the documented limitation: *Refresh Reports* picks up new entity types, not schema changes to existing ones — finalise forms before building elaborate dashboards.

### The funnel in one query

```sql
-- Launchpad funnel by cohort (adjust quoted column names to your schema)
select
  e."cohort",
  count(*)                                                        as registered,
  count(s.id)                                                     as screened,
  count(*) filter (where s."screening decision" = 'Shortlisted')  as shortlisted,
  count(*) filter (where sel."selection decision" = 'Selected')   as selected,
  count(distinct ses.program_enrolment_id)                        as started,
  count(c.id)                                                     as completed
from applicant_launchpad e
left join applicant_launchpad_screening  s   on s.program_enrolment_id   = e.id
left join applicant_launchpad_selection  sel on sel.program_enrolment_id = e.id
left join applicant_launchpad_session    ses on ses.program_enrolment_id = e.id
left join applicant_launchpad_completion c   on c.program_enrolment_id   = e.id
group by e."cohort";
```

### Dashboards to build

| Dashboard | Audience | Questions on it |
|---|---|---|
| **Registration** (live during the window) | Program lead | Total registrations (vs. target, as a progress gauge) · registrations per day (line) · by state (from the *State* observation — the address column is always "India") · by org type · by channel (donut) |
| **Screening ops** | Screening team, daily | Pending-screening count · screened per day · shortlist rate · score distribution · rejects by reason · per-screener throughput |
| **Funnel** | Leadership | The funnel query as a funnel chart · conversion % between every stage · cohort-over-cohort comparison (this is where the single-program design pays off) |
| **Participation** | Program ops, weekly | Sessions attended per applicant (heat/bar) · milestone status breakdown · at-risk/stalled list **with contact person name, email, phone** (the concept note's "reach out" requirement — a table question joining the enrolment to the applicant's contact observations) · completion rate · attrition by exit reason |

**KPIs:** registrations vs. target · screening backlog (and median days registration→screening) · shortlist rate · selection rate · start rate among selected · session attendance rate · completion rate · drop-out rate by stage.

---

## Phase 8 — Testing checklist

| # | Area | Test | Pass criterion |
|---|---|---|---|
| 1 | Registration | Submit valid form | Subject + enrolment in Data Entry App ≤ 1 min; confirmation email received |
| 2 | Registration | Missing/invalid fields, bad email | Rejected at proxy with a clear message; nothing created in Avni |
| 3 | Duplicates | Same email twice (incl. double-click and case/whitespace variants) | Exactly one subject, one enrolment |
| 4 | Duplicates | Same email, same cohort, changed answers | Existing record updated, not duplicated |
| 5 | Re-application | Cohort-4 exit re-registers for Cohort 5 (test values) | Same subject, second enrolment |
| 6 | API failure | Proxy pointed at wrong Avni URL | Applicant sees graceful message; payload in dead-letter store; replay succeeds; replay of an already-succeeded payload creates nothing new |
| 7 | Auth | Run past token expiry (>1 h continuous) | Token refresh transparent, no failed registrations |
| 8 | Abuse | Submit without captcha token; hammer the endpoint | 403 / rate-limited |
| 9 | Security | Use the integration user's token to GET subjects / other endpoints | Denied — privileges limited to register + enrol |
| 10 | Screening | Full screening encounter incl. mandatory-field and score-range validations | Form rules enforce; decision saved |
| 11 | Exit paths | Reject, withdraw, complete | Exit reason recorded; applicant leaves "pending" lists |
| 12 | Permissions | Launchpad Team member tries App Designer / admin functions | Denied |
| 13 | Visibility | Each team user searches and opens applicants | All applicants visible (catchment correct) |
| 14 | Reporting | Register test applicant → check Metabase after ETL cycle | Appears in `applicant` and funnel numbers within ~1 h |
| 15 | Reporting | Reconcile: form submissions vs. proxy logs vs. Metabase count | All three match for a test batch |
| 16 | Fallback | Import a CSV batch via bulk upload | Rows created correctly; drill documented |

---

## Phase 9 — Go-live checklist

- [ ] All Phase 8 tests pass on the production org; test/demo subjects voided or clearly named
- [ ] Integration user password rotated post-testing and stored only in the proxy's secret store
- [ ] Registration page on its final domain, HTTPS, captcha keys production-mode
- [ ] Proxy deployed with production env (Avni URL, cohort = "Cohort 4", open/close dates); dead-letter alerting wired to email/Slack
- [ ] Confirmation email sending verified through the existing n8n email setup (send a test to a few external inboxes — Gmail, Outlook — to confirm it lands)
- [ ] Privacy note + consent text reviewed (DPDP); data-retention decision recorded
- [ ] Team users created, passwords set, one dry-run screening done by each screener
- [ ] Metabase dashboards live; registration-target number configured; leadership has access
- [ ] Ops runbook: how to check dead letters, replay, run the CSV fallback, and who to call at Avni
- [ ] Registration window close behaviour verified (form closes, proxy rejects late submissions)
- [ ] Soft launch: share the link with a small internal group for 24 h before public announcement

---

## Risks & edge cases

| Risk | Impact | Mitigation (built into this design) |
|---|---|---|
| Registration spike / spam bots | Junk subjects pollute the funnel | Captcha + rate limiting; least-privilege API user; voiding cleans up stragglers |
| Proxy or Avni down during the window | Lost applications | Dead-letter store + idempotent replay; CSV bulk-upload fallback; "email only on success" keeps promises honest |
| Same person, two email addresses | Duplicate applicant | Phone-number duplicate report in Metabase; manual void/merge |
| Cognito token/password drift (expiry, forced reset) | All registrations fail | Token cache with refresh; password never set to expire for the integration user; test #7; dead-letter alert catches it within minutes |
| Form changed after launch | ETL schema churn; Metabase refresh only handles *new* entity types | Freeze forms before launch (Phase 3 test); additive changes only during the window |
| Concept renamed casually | Reporting columns shift; proxy payload keys break | Treat concept names as an API contract; document them; never rename mid-cohort |
| ETL lag misread as data loss | Panic during launch day | Set the expectation: Data Entry App is real-time, Metabase is hourly |
| PII exposure | Legal/reputational | Consent recorded as data; RLS-isolated org; Metabase access only via Analytics privilege; no PII in proxy logs beyond what's needed for replay |
| Screener inconsistency | Unfair selection | Structured rubric with numeric ranges; optional approval workflow; per-screener score distribution question in Metabase |

---

## Technology stack for what you build

| Piece | Recommendation | Why |
|---|---|---|
| Registration page | **Standalone Vite + React app in its own repo**, styled to match avniproject.org/signup (borrow logo/palette/component styles from the open-source avni-website repo); own S3 bucket + CloudFront + custom domain | Separate site by decision — independent deploys, its own URL, room to grow into a Launchpad mini-site; Vite is the lightest way to a static React bundle |
| Proxy | **n8n workflow** (recommended — the website's signup already posts to `avniproject.app.n8n.cloud`, so this pattern is in production) or **AWS Lambda + API Gateway** with secrets in SSM/Secrets Manager | n8n: zero new infra, existing ownership, built-in execution log + error workflow. Lambda: versioned code, better for captcha/rate limiting. Same contract either way |
| Dead-letter store | **SQS** (native Lambda DLQ) or a DynamoDB table | Durable replayable payloads; volume is tiny; both are first-class Lambda integrations |
| Captcha | Cloudflare Turnstile (or reCAPTCHA v3) | Free, invisible to most users, server-side verifiable |
| Confirmation email | **n8n** — sent from the existing n8n account's email node, as done in previous cohorts | Avni does not email applicants on registration — this gap is filled by the same n8n setup already proven in earlier Launchpad cohorts; nothing new to configure |
| Everything else | Avni hosted service + its Metabase | Zero infrastructure for the entire tracking and reporting layer |

---

## Phased plan with dependencies

The Cohort 4 window is already open on the Google Form and closes **Sep 25, 2026** — about four weeks out. The plan below fits, but tightly; the Google Form keeps collecting in parallel, and the import script (Phase 5) guarantees nothing is lost regardless of when the new page goes live. If the timeline slips, the fallback posture is: run Cohort 4 registration entirely on the Google Form + import script, and launch the public page for Cohort 5 — everything else (org, data model, Data Entry workflow, Metabase) is unaffected.

| Week | Workstream | Depends on |
|---|---|---|
| 1 | Phase 1 workflow sign-off · request org creation with analytics enabled | — |
| 1–2 | Phase 2 org setup (locations, groups, users) · Phase 3 concepts + subject type + program + forms | Org exists; workflow signed off |
| 2 | Manual end-to-end walkthrough in Data Entry App (the Phase 3 test) | Forms complete — **gate: freeze forms here** |
| 2–3 | Phase 4–5 registration page + proxy against the frozen forms | Concept names frozen; integration user created |
| 3 | Phase 7 Metabase setup + funnel/registration dashboards | ETL running; a few test registrations present |
| 4 | Phase 8 full test pass · Phase 6 team training/dry run | Everything above |
| 4–5 | Phase 9 go-live: soft launch → public announcement | Checklist green |
| Cohort 5, later | Add "Cohort 5" answer · flip proxy env var · reopen form | ~One day, by design |

---

## Decisions to resolve before development starts

1. **Identity key:** email (recommended) or phone as the de-duplication key? Determines the External ID scheme — hard to change after launch.
2. **Registration form fields, final list** — including which are mandatory, and the exact coded answer sets (states? channels? categories?). Freezing this gates the proxy build.
3. **Screening rubric:** criteria, score ranges, and what score/decision combination means "shortlisted". Also: single screener per application, or two with reconciliation (→ approval workflow yes/no)?
4. **Cohort 4 registration window** — closes Sep 25, 2026 per the live Google Form; confirm whether the new page replaces the Google Form mid-window or launches for Cohort 5. Also set the registration **target** number (drives the target-vs-actual dashboard).
5. **Journey shape after selection:** how many sessions, milestone cadence, and what "completed" formally requires — determines the Session/Milestone/Completion form details.
6. **Consent + privacy text** and retention policy for non-selected applicants' data (DPDP review).
7. **Proxy runtime: n8n workflow or Lambda?** The website's signup already runs through n8n (`avniproject.app.n8n.cloud/webhook/avni-signup`), which argues for a second workflow there; Lambda gives versioned code and easier captcha/rate limiting. Decide with whoever owns the existing n8n instance. Remaining AWS specifics either way: region, DNS ownership for the registration URL, and who's on-call for failure alerts during the window.
8. **Confirmation email** sender domain and copy.
9. **Org naming:** final organisation name and username suffix (cosmetic but permanent).
10. **Re-application policy:** may Cohort-4 rejects apply to Cohort 5? (The model supports it either way; the proxy can enforce the policy.)

---

*Grounded in the Avni docs current as of Aug 2026: [API guide](https://avni.readme.io/docs/api-guide) · [external API Swagger](https://editor.swagger.io/?url=https://raw.githubusercontent.com/avniproject/avni-server/master/avni-server-api/src/main/resources/api/external-api.yaml) · [ETL schema](https://avni.readme.io/docs/etl-schema-and-reporting) · [self-service reports](https://avni.readme.io/docs/self-service-reports-guide-for-avni) · [access control](https://avni.readme.io/docs/access-control) · [identifiers](https://avni.readme.io/docs/creating-identifiers) · [bulk upload](https://avni.readme.io/docs/upload-data). Everything labelled "Avni provides" is documented behaviour; payload field names come from the Swagger spec verbatim. Column names in the reporting schema derive from your concept names — verify in Metabase's data browser before finalising SQL.*
