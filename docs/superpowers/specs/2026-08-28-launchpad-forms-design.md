# Launchpad Forms — design

**Status:** approved 28 Aug 2026 (Himesh, after the brainstorming session). Supersedes the glue design in `docs/implementation-plan.md` Phases 4–5; the Avni-side model in that document stands.

## 1. What this is

A public signup page at `forms.avniproject.org` for the Avni Launchpad cohort programme. An applicant fills one form, no login. The submission becomes an **Applicant** subject and a **Launchpad** program enrolment in the `Avni Launchpad` organisation, through Avni's external API. From there everything is standard Avni: the team screens and tracks applicants in the Data Entry App, the hourly ETL flattens the data, and Metabase shows the funnel.

## 2. Decisions

1. **No sign-in.** The page is public; registrations enter through the external API.
2. **The credential lives in a small Node service in this repo, on the same node as the page.** It verifies the captcha, gets an Avni token, and posts the subject and enrolment. Not in the browser (the password would be public, and the API updates on repeat — anyone could overwrite applicants); not inside avni-server (that is the roadmap "Surveys" item, ~320h, unscheduled); not n8n (rejected for product glue on 24 Aug 2026 — hard to maintain, test and review); not Lambda / S3 / CloudFront (no precedent in `avni-infra`).
3. **Host: Avni's own reporting node** (`ssh.reporting-metabase.avniproject.org`), behind the shared `reporting-alb`, using a copy of the `tanuh_webapp` Ansible role. Not the Tanuh node — its cost is passed through to Tanuh.
4. **After submitting, the applicant sees a success screen with a reference.** No email in v1 (avni-server cannot send one). WhatsApp via Glific can be added later with no code: message rules already fire on these saves.
5. **One hand-built form.** Fields and the field-to-concept mapping are data served by the service, so a second form is a new route plus a new module.
6. **Look and feel = `avniproject.org/signup`**: Avni header, centred white card, brand orange `#ff470f`, reCAPTCHA v2, privacy-policy consent checkbox.
7. **Observability = what already exists**: Bugsnag (browser + service), PostHog (three funnel events, same public key as avni-webapp), nginx access log with upstream timing, systemd journal, `GET /healthz`.
8. **UAT is a separate `Avni Launchpad UAT` organisation with its own integration user**, on the same production avni-server — the tanuh precedent. Row-level security makes it a hard boundary: no test submission can reach the live funnel or a Metabase count.

### Before / now

| | `implementation-plan.md` (28 Aug, morning) | This design |
|---|---|---|
| Static page | Own S3 bucket + CloudFront | nginx on the Avni reporting node, shared ALB |
| Credential holder | n8n workflow or Lambda + API Gateway | Fastify service in `server/`, systemd, vaulted env file |
| Avni auth | Cognito SDK | `POST /api/user/generateToken` — plain HTTPS |
| Confirmation | Email via n8n | Success screen with reference id |
| Dead-letter | SQS / DynamoDB | Local JSONL of failed payloads + replay script |
| API user privilege | "Register subject" | `EditSubject` on Applicant + `EnrolSubject` on Launchpad (what the controllers check) |
| Moving parts operated | n8n cloud + Lambda + S3/CF + Avni | One node already run + Avni |

Trade: a managed retry queue and email are given up for a single process on a box already operated. At Launchpad volume — a few thousand submissions — that is the right trade.

## 3. Architecture

```
Browser ──HTTPS──▶ reporting-alb (host rule: forms.avniproject.org, ACM cert, health check /healthz)
                        │
                        ▼  :8090 (prod) / :8091 (uat)
                 nginx on the reporting-metabase node
                   ├─ /                → static Vite bundle (/var/www/launchpad-forms)
                   ├─ /api/form-config → 127.0.0.1:4000
                   ├─ /healthz         → 127.0.0.1:4000
                   └─ /api/submit      → 127.0.0.1:4000  [limit_req, real client IP from the ALB]
                                            │ honeypot → validate → window → reCAPTCHA siteverify
                                            │ POST /api/user/generateToken   (token cached ~50 min)
                                            │ POST /api/subject              ─┐ AUTH-TOKEN header
                                            │ POST /api/programEnrolment     ─┘
                                            ▼
                                     app.avniproject.org (org: Avni Launchpad / Avni Launchpad UAT)
                                            │ hourly ETL
                                            ▼
                                     Metabase (self-service) · Data Entry App (screening, sessions, exit)
```

The page exposes exactly three paths. There is **no** generic `/api/*` passthrough to avni-server.

## 4. Verified facts about avni-server that shape the code

- `POST /api/user/generateToken` is on the unprotected list (`ResourceProtectionStatus.java:27`) and returns a JWT for a user whose settings have "Is Allowed To Invoke Token Generation API" on (`UserApiController.java:56-73`). No AWS SDK needed.
- `POST /api/subject` checks `EditSubject` on the subject type (`SubjectApiController.java:125`); `POST /api/programEnrolment` checks `EnrolSubject` on the program (`ProgramEnrolmentApiController.java:64`).
- Both **upsert on `External ID`** (`findByLegacyId(externalId.trim())`, case-sensitive) — a second call with the same id updates in place. Normalise the email to lower-case before use.
- JSON keys are literal strings with spaces (`"External ID"`, `"Subject type"`, `"Registration date"`, `"First name"`, `"Address"`, `"observations"`).
- Stay on the default API `version` (1) and send `"Address": "India"` (a title lineage). `version>=3` demands `Address map` instead.
- **`RequestUtils.createObservations` has no null guard (`RequestUtils.java:14-20`) and the enrolment controller calls it on `exitObservations` unconditionally (`ProgramEnrolmentApiController.java:108`)** → every enrolment POST must carry `"observations": {}` **and** `"exitObservations": {}` or it fails with a 500.
- No CORS anywhere in avni-server → the browser must stay same-origin (hence nginx). No captcha, no rate limiting, no email in avni-server → all three live in front of it.
- `created_by` on every record = the integration user (JPA auditing from the token's user).
- Message rules (`@Messageable`) fire on these saves — Glific WhatsApp needs configuration only.
- `avni.web.validHosts` is empty, so the host-name filter is inert; the service's server-to-server calls carry `Host: app.avniproject.org` regardless.

## 5. Repository layout

Two independent packages; **no npm workspaces, no shared TypeScript package**. The server serves the field spec (`GET /api/form-config`) and the web app renders it — one source of truth, no cross-package build coupling, and the registration-window state arrives with the spec so "closed" needs no rebuild.

```
Makefile  .nvmrc (v24.4.1)  RELEASE_WORKFLOW.md  .github/workflows/ci.yml (web + server jobs)
docs/CONTRACT.md            # the HTTP contract and the field → concept table (written first)
docs/implementation-plan.md # Avni-side model; Phases 4–5 point here
docs/RUNBOOK.md
web/    package.json vite.config.ts tsconfig.json eslint.config.js index.html .env.example
        src/{main.tsx, App.tsx, theme/, components/, pages/{LaunchpadForm,SuccessScreen,ClosedScreen},
             forms/{FormRenderer.tsx, fields/*}, validation/validators.ts, fixtures/form-config.json}
server/ package.json tsconfig.json .env.example
        src/{index.ts, routes/{submit,formConfig}.ts, avni/{token,client}.ts,
             forms/launchpad-cohort.ts, mapping/launchpad-cohort.map.ts,
             validation/schema.ts, captcha.ts, deadletter.ts, log.ts, bugsnag.ts}
        test/*.test.ts   scripts/{replay.mjs, smoke.sh}
```

The **mapping is server-side** (`mapping/launchpad-cohort.map.ts`, one table of field id → concept name). The browser posts plain field JSON; concept names never reach the bundle.

Environment: `web/.env.example` — `VITE_API_BASE=` (empty = same origin), `VITE_RECAPTCHA_SITEKEY`, `VITE_BUGSNAG_KEY`, `VITE_POSTHOG_KEY`. `server/.env.example` — `PORT=4000`, `AVNI_BASE_URL=https://app.avniproject.org`, `AVNI_USERNAME`, `AVNI_PASSWORD`, `RECAPTCHA_SECRET`, `RECAPTCHA_BYPASS_TOKEN` (UAT only; empty on prod), `BUGSNAG_KEY`, `COHORT=Cohort 4 – Eastern India`, `REG_OPEN`, `REG_CLOSE`, `SUBJECT_TYPE=Applicant`, `PROGRAM=Launchpad`, `ADDRESS=India`, `DEAD_LETTER_PATH=/var/lib/launchpad-forms/dead-letter.jsonl`, `LOG_LEVEL=info`. **Never a secret in a `VITE_` variable** — they are inlined into the bundle.

## 6. The service (Fastify + pino + zod)

| Endpoint | Behaviour |
|---|---|
| `GET /healthz` | `{ok, cohort, open, tokenCached}`. No Avni call — the ALB health check must not depend on Avni |
| `GET /api/form-config` | Field spec + window state; cache 60 s |
| `POST /api/submit` | honeypot filled → 200 fake success · zod validation (schema derived from `forms/launchpad-cohort.ts`) · window check · reCAPTCHA `siteverify` (5 s timeout; the bypass token is honoured only when the env var is non-empty) · token · subject · enrolment · 200 with a reference |

**Token:** module-level `{token, fetchedAt}`, TTL 50 min, one in-flight promise so a cold burst makes one call. Any 401 → clear, fetch once, retry that call once. 5xx → two retries (500 ms, 1500 ms). 10 s timeout per call.

**Payloads** (default `version`; do not send the query param):

```jsonc
// POST {AVNI_BASE_URL}/api/subject      AUTH-TOKEN: <token>
{ "External ID": "priya@abcfoundation.org", "Subject type": "Applicant",
  "Registration date": "2026-08-28", "First name": "ABC Foundation", "Address": "India",
  "observations": { "Contact person name": "Priya Sharma", "Contact email": "priya@abcfoundation.org",
                    "Consent to data use": "Yes", "…": "…" } }

// POST {AVNI_BASE_URL}/api/programEnrolment
{ "External ID": "priya@abcfoundation.org::cohort-4", "Program": "Launchpad",
  "Subject external ID": "priya@abcfoundation.org",
  "Enrolment datetime": "2026-08-28T10:23:00.000+05:30",
  "observations": { "Cohort": "Cohort 4 – Eastern India", "…": "…" },
  "exitObservations": {} }          // required — omitting it is a 500
```

External ID = `email.trim().toLowerCase().normalize("NFKC")`; enrolment id = `${externalId}::${slug(COHORT)}` (`slug` = lower-case, non-alphanumerics → `-`). Logs carry only `sha256(externalId).slice(0, 12)`.

**Idempotency is the API upsert; there is no client submission id.** The External ID survives a refresh, a new tab and a new device; a client-generated id cannot. The hazard is the reverse: replaying a stale dead-letter overwrites newer answers. Mitigated procedurally — `replay.mjs` prints each payload's `receivedAt` and requires `--confirm`; the runbook says replay the same day.

**Rate limiting is nginx `limit_req` only.** The service binds `127.0.0.1`; a second in-process limiter would just disagree with the edge. nginx must take the real client IP from the ALB's `X-Forwarded-For` (`set_real_ip_from`, `real_ip_header`) or the whole internet counts as one client.

**Error taxonomy**

| Condition | HTTP | `code` | UI |
|---|---|---|---|
| validation | 400 | `VALIDATION_FAILED` + `fieldErrors` | mark fields, scroll to the first |
| captcha missing/failed | 400 | `CAPTCHA_FAILED` | reset the widget, ask again |
| outside the window | 403 | `REGISTRATION_CLOSED` | closed screen |
| nginx limit | 429 | — | "too many attempts, try again in a minute" |
| Avni 4xx (e.g. unknown concept name) | 202 | `QUEUED` | success screen + reference; **dead-lettered**, Bugsnag error |
| Avni 5xx / unreachable after retries | 202 | `QUEUED` | success screen + reference; dead-lettered |
| anything else | 500 | `INTERNAL` | generic error + retry; Bugsnag |

A dead-lettered submission returns 202 and the success screen because the application *is* durably captured; an error would make the applicant retype 25 answers for nothing. Reference: `LP-<first 8 hex of the enrolment UUID>` when live, `LP-Q-<first 8 hex of the submission id>` when queued.

**Dead-letter:** one JSON line `{submissionId, receivedAt, cohort, payload, error}` appended to `DEAD_LETTER_PATH`, mode 0600, owned by the service user, on the unit's `ReadWritePaths`. It holds full personal data; the runbook purges it after replay. A queue would take longer to build than any outage it protects against would last at this volume.

**Logging:** one pino line per submission — `{submissionId, emailHash, orgName, outcome, avniStatus, ms}`. No raw email, phone or free text. The organisation name stays: it is what makes a line actionable, and it is not personal data.

**Bugsnag** (`@bugsnag/node`): `releaseStage` uat/prod, `appVersion` from `package.json`, `redactedKeys: [/email/i, /phone/i, /whatsapp/i, "payload"]`.

## 7. The web app

- Routes `/` and `/launchpad` → `<LaunchpadForm/>`. A later form is a new route and a new server module.
- **One scrolling page of sectioned cards, not a wizard.** Twenty-five fields are browsable; a wizard doubles the state and validation surface.
- Fetch `/api/form-config`; render sections and fields from it (`FormRenderer` + `fields/{Text,Notes,CodedRadio,CodedSelect,Number,Phone,Email,YesNo,Checkbox}`). Validate on blur and on submit; map server `fieldErrors` back onto fields; scroll to the first error.
- Draft in `sessionStorage` under `launchpad-draft-v1`, debounced 500 ms, cleared on success; the captcha token is never persisted.
- Screens: form · success (reference, and "submitting again with the same email updates your application") · closed · error.
- Privacy note and consent checkbox link to the Avni Privacy Policy, as the website's signup does. Consent is stored as an observation.
- **Copy from `../avni-tanuh-physician-app`:** `eslint.config.js`, `tsconfig.json`, `vite.config.ts` (proxy prefixes → `["/api", "/healthz"]`, target `http://localhost:4000`), `src/hooks/useAsync.ts`, `src/components/ErrorBoundary.tsx`, `src/theme/index.ts` (primary → `#ff470f`, `shape.borderRadius: 16`, keep `textTransform: none`, drop the `Mui-disabled` overrides), `Makefile`, `.nvmrc`, `.github/workflows/ci.yml`, `RELEASE_WORKFLOW.md`. **Drop:** `src/auth/**`, `LoginPage`, `NotAuthorized`, `roles.ts`, `src/api/**`, and the deps `aws-amplify`, `keycloak-js`, `@mui/x-date-pickers`, `date-fns`, `lodash`.
- **Copy from `../avni-website/src/pages/signup/index.js`:** `EmailValidator` / `PhoneValidator` / `NameValidator` (lines 18–105, ported to TS; drop the role-address rejection — NGOs apply from `info@`), card/input/button styles (lines ~395–530: white card, radius 16, `max-width 625px`, shadow `0 20px 40px rgba(0,0,0,0.1)`), `react-phone-number-input` with `defaultCountry="IN"`, `react-google-recaptcha`, the honeypot `_gotcha`, the consent checkboxes. **Do not copy lines 113–114** — they hard-code a real person's name and email as state defaults.
- **PostHog** (`posthog-js`; key and host as in `avni-webapp/src/providers.tsx`, public by design): `form_viewed{cohort}`, `form_submitted{outcome}`, `submit_failed{code}`. No `identify`, no session recording — there is personal data on screen.
- **Bugsnag** (`@bugsnag/js` + `@bugsnag/plugin-react`) around the error boundary.

## 8. Infrastructure (`avni-infra`)

**Copy `configure/roles/tanuh_webapp` → `configure/roles/launchpad_forms`. Do not generalise** — the tanuh role serves a live app on another host and the right diff to it is zero.

- Remove `templates/nginx-upstream-dns-watch.sh.j2`, its two tasks and the `upstream avni_backend` block: the browser never talks to avni-server.
- Build in `{{ build_dir }}/web`, rsync `web/dist/` to the docroot; `npm ci --omit=dev` in `{{ build_dir }}/server`; render `/etc/launchpad-forms.conf` (0600, root) and `/etc/systemd/system/{{ instance }}-svc.service` from `roles/snapshot_server/templates/snapshot-server.service.j2` (keep `NoNewPrivileges`, `ProtectSystem=strict`, `SystemCallFilter=@system-service`; set `ReadWritePaths={{ state_dir }}`, `MemoryLimit=512M`, `ExecStart=/usr/bin/node dist/index.js`); `daemon_reload`; restart on change. The role opens `{{ listen_port }}` in ufw (8090/8091 are not in `prod_vars.yml`).
- nginx: exact locations only, plus the existing `/assets/` immutable caching, `index.html` `no-store`, SPA `try_files`, gzip and the upstream-timing `log_format`:

```nginx
set_real_ip_from 172.31.0.0/16;   # confirm the VPC CIDR
real_ip_header X-Forwarded-For;  real_ip_recursive on;
limit_req_zone $binary_remote_addr zone=lp_ip{{ _sfx }}:10m rate=10r/m;
limit_req_zone $server_name       zone=lp_all{{ _sfx }}:1m  rate=120r/m;
location = /api/submit      { limit_req zone=lp_ip{{ _sfx }} burst=5 nodelay; limit_req zone=lp_all{{ _sfx }} burst=40;
                              proxy_pass http://127.0.0.1:{{ svc_port }}; }
location = /api/form-config { proxy_pass http://127.0.0.1:{{ svc_port }}; }
location = /healthz         { proxy_pass http://127.0.0.1:{{ svc_port }}; }
```

  Headers: `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `X-Frame-Options DENY`, and a CSP allowing `www.google.com`, `www.gstatic.com` (reCAPTCHA), `eu.i.posthog.com`, `*.bugsnag.com`.
- Role vars (`defaults/main.yml`, prefix `launchpad_forms_`): `repo_url`, `git_ref`, `instance_name`, `listen_port` 8090, `svc_port` 4000, `server_name`, `node_major "24"`, `state_dir /var/lib/launchpad-forms`, the env keys.
- Playbook: two role invocations appended to `configure/prod_metabase_servers.yml` (host group `metabase_server`), mirroring `prod_tanuh_metabase_servers.yml:31-53`: prod tagged `launchpad_forms` (`git_ref` = a release tag, 8090/4000, `forms.avniproject.org`); UAT tagged `launchpad_forms_uat` with `when: "'launchpad_forms_uat' in ansible_run_tags"` (`main`, 8091/4001, `uat-forms.avniproject.org`). The `when` guard keeps a bare `make metabase-prod` away from UAT.
- Secrets in `group_vars/prod-secret-vars.yml.enc` (`ansible-vault edit`): `launchpad_forms_avni_password`, `launchpad_forms_uat_avni_password`, `launchpad_forms_recaptcha_secret`, `launchpad_forms_bugsnag_key`, `launchpad_forms_uat_captcha_bypass_token`.
- `configure/Makefile`: `launchpad-forms-prod` and `launchpad-forms-uat` targets (`ansible-playbook prod_metabase_servers.yml -i inventory/prod --tags …`).
- ALB, certificate and DNS: copy `tanuh-webapp/aws_alb_setup.sh` and `aws_alb_teardown.sh` to `launchpad-forms/`. **Discover before running** — the script's defaults (`TANUH_INSTANCE_TAG=tanuh-metabase`, `TANUH_SG_NAME=tanuh-metabase-sg`) are wrong for this host and there is no `reportingSystem/metabase/aws_setup.sh` to read from: list running instances with Name tags and security groups; list the 443 listener's rule priorities and confirm 33/34 are free. Then run once per host name (`uat-forms…` TG `launchpad-forms-uat` port 8091 priority 34; `forms…` TG `launchpad-forms` port 8090 priority 33) with `--health-check-path /healthz`. Non-idempotent steps: `acm request-certificate`, `create-target-group`, `create-rule`, `authorize-security-group-ingress`. A wrong instance tag aborts **after** creating the certificate and target group — run the teardown before retrying.

## 9. Avni-side configuration (no code)

1. Organisations `Avni Launchpad UAT` (`@launchpaduat`) and `Avni Launchpad` (`@launchpad`), analytics/ETL enabled. Build UAT first.
2. Address-level type `Country` with one location `India`; catchment `All India`.
3. Concepts per the field inventory (§10); coded answer names exactly as Metabase should show them.
4. Subject type `Applicant` (Individual): *Allow empty location* on, *Unique name* off. Registration form pages "Organisation" and "Contact person".
5. Program `Launchpad`, **multiple enrolments on**. Forms "Launchpad Application" (Cohort required) and "Launchpad Exit".
6. Groups: `Everyone` → all privileges off. `Launchpad Admin` (all + Analytics), `Launchpad Team`, `API Integration` = **only `EditSubject` on Applicant and `EnrolSubject` on Launchpad**.
7. User `launchpad-forms@launchpad` (and `@launchpaduat`): role User, group API Integration, catchment All India, **"Is Allowed To Invoke Token Generation API" on**, one browser login to clear the forced password change, password set not to expire.
8. Organisation config → custom search result fields: contact email, contact phone.
9. Bundle export from UAT → import into prod, then re-check concept names against `mapping/launchpad-cohort.map.ts`.
10. Prod organisation → Reports → Self-service → *Setup Reports*.

Concept names are an API contract. A rename in the App Designer mid-window fails every submission with a 500.

## 10. Field inventory — the live AL4 Google Form, mirrored 1:1

Source: "Avni Launchpad 4.0 – Eastern India Cohort | Signup Form" (4 pages, all questions required, closes 25 Sep 2026 11:59 PM IST). Mirroring it means the Cohort 4 import maps one-to-one and nobody re-decides fields on build day. Split per the rule *an Applicant is permanent; a cohort attempt is an enrolment*.

| # | Question (shortened) | Web form type | Avni form | Concept |
|---|---|---|---|---|
| 1 | Your email address | Email — **dedup key → External ID** | Registration | Contact email |
| 2 | Name | Text | Registration | Contact person name |
| 3 | Organisation | Text → subject name (`"First name"`) | Registration | — |
| 4 | Designation / Role of Primary Contact | Text | Registration | Contact role |
| 5 | Primary Contact Mobile Number (WhatsApp preferred) | Phone (IN) | Registration | Contact phone |
| 6 | Organisation Website (or "Not available") | Text | Registration | Organisation website |
| 7 | Organization Headquarter (City and State) | Text — open question A | Registration | Headquarters |
| 8 | Foundation year of the organisation | Numeric (year) | Registration | Foundation year |
| 9 | Annual budget of the organisation | Text — open question B | Registration | Annual budget |
| 10 | Used digital data collection / MIS tools before? | Coded: Yes, currently using · Yes, have used earlier · Never used digital data collection/MIS tools | Enrolment | Prior MIS tool use |
| 11 | How familiar are you with Avni? | Coded: attended an Avni demo/webinar · explored the website, videos or case studies · heard about Avni but not explored · completely new | Enrolment | Avni familiarity |
| 12 | Name of the intervention to digitise | Text | Enrolment | Intervention name |
| 13 | Since when has the program been operational? | Text | Enrolment | Program operational since |
| 14 | How long do you anticipate it continuing? | Text | Enrolment | Anticipated program duration |
| 15 | Until when is funding secured? | Text | Enrolment | Funding secured until |
| 16 | Current challenges in field data / monitoring / reporting (≤200 words) | Notes | Enrolment | Current challenges |
| 17 | Pilot use case — activities, beneficiaries, tracking, users, outcomes (≤400 words) | Notes | Enrolment | Pilot use case |
| 18 | Expected number of field users | Numeric | Enrolment | Expected field users |
| 19 | Dedicated person/team for MIS or M&E? | Coded: Yes · No · No, planning to recruit in next 3 months | Enrolment | MIS/M&E team |
| 20 | A team member meeting the three criteria (6–8 h/week Oct–Nov 2026; comfortable with smartphones, spreadsheets, Google-Forms-style apps; can attend the Bhubaneswar workshop)? | Coded: Yes · No | Enrolment | Dedicated team member available |
| 21 | Looked at Avni pricing and is it clear? | Coded: Yes · No | Enrolment | Pricing understood |
| 22 | Comfortable taking a paid plan after the pilot (mid-December)? | Coded: Yes · No · I would like to discuss more | Enrolment | Paid plan intent |
| 23 | How did you hear about the Avni Launchpad? | Coded: Avni website · Samanvay / Avni team · NGO partner network · Social media · Tamuku · India Partner Network · Reference · Other (+ text) | Enrolment | Referral source (+ Referral source other) |
| 24 | Agreement ("I agree": information accurate; genuine interest; reasonable efforts if selected) | Required checkbox | Enrolment | Application agreement = Yes |
| — | Cohort | Set by the service from `COHORT`; never user-entered | Enrolment | Cohort |
| — | Privacy-policy consent (website pattern; not on the Google Form) | Required checkbox | Registration | Consent to data use = Yes |

Open questions for the Launchpad team (defaults apply if unanswered by build-day 09:00): **A** — keep Headquarters as one free-text field like the Google Form (default) or split into City + State dropdown for state-wise dashboards; **B** — keep Annual budget free text (default) or coded bands.

## 11. Testing

- **vitest** (`server/test/`): mapping — both payloads, with a test that pins `"observations": {}` and `"exitObservations": {}`; External ID normalisation; enrolment id suffix; zod; window; error taxonomy.
- **nock**: happy path; 401 → new token → retry once → success; two 5xx → dead-letter written; Avni 400 "Concept with name=X not found" → dead-letter + Bugsnag.
- **`server/scripts/smoke.sh`**: `/healthz`, `/api/form-config`, `POST /api/submit` with the bypass token against UAT; run twice and confirm one subject in the Data Entry App.
- **Manual matrix on UAT**: double-submit; email case/whitespace variants; re-application as `::cohort-5`; window closed → 403; captcha omitted → 400; `AVNI_BASE_URL` black-holed → 202, JSONL line, `replay.mjs --confirm` → subject appears, replay again → unchanged; a thrown test error reaches Bugsnag from both sides.
- **Playwright**: day 2+, in-repo under `web/e2e/` (the `avni-qa/webapp-auto-qa` harness is login-driven console tooling; nothing transfers).

## 12. Promotion and operations

`develop` → `main` → `make launchpad-forms-uat` (UAT tracks `main`) → sign-off → `git tag vX.Y.Z` → bump `launchpad_forms_git_ref` in `prod_metabase_servers.yml` → `make launchpad-forms-prod`. Rollback = previous tag, re-run.

`docs/RUNBOOK.md`: health (`curl /healthz`), logs (`journalctl -u launchpad-forms-svc -f`), nginx upstream log, queue depth (`wc -l` on the JSONL), replay (`replay.mjs --confirm`), purge after replay (`shred -u` — it holds personal data), rotate the password (Avni admin → `ansible-vault edit` → `make launchpad-forms-prod`), change the window (`REG_CLOSE` → redeploy).

## 13. Build-day sequencing (one day, four parallel lanes)

Before 09:00: reCAPTCHA key owner found and `forms.` + `uat-forms.avniproject.org` added to the website's key (or a new pair minted); SSH to the reporting node works; AWS CLI and the vault password file on the deploying machine; Bugsnag keys; questions A/B put to the Launchpad team.

09:00–09:30, serialised: `docs/CONTRACT.md` final, repo from the tanuh skeleton, `web/src/fixtures/form-config.json`, push `develop`. Then four worktrees:

| | Lane A — web | Lane B — server | Lane C — infra | Lane D — Avni config (human) |
|---|---|---|---|---|
| 09:30–10:30 | skeleton, strip auth, theme, validators | Fastify skeleton, `/healthz`, `/api/form-config`, zod-from-spec, pino, Bugsnag | copy role, drop dns-watch/upstream, add server tasks + unit | UAT org, locations, groups, integration user, token flag, browser login |
| 10:30–11:30 | `FormRenderer` + fields vs fixture | `avni/token.ts`, `avni/client.ts` | nginx template, real_ip, limit_req, headers, CSP | concepts, subject type, program, forms in UAT |
| 11:30–12:30 | layout, phone, reCAPTCHA, honeypot, consent, draft | mapping, dead-letter, captcha verify | playbook, Make targets, vault secrets, ALB discovery | manual walkthrough in the Data Entry App |
| 12:30–13:00 | success / closed / error, PostHog, Bugsnag | vitest + nock green, `smoke.sh`, `replay.mjs` | `aws_alb_setup.sh` for `uat-forms` | concept names to Lane B; reCAPTCHA domains confirmed |
| 14:00 | **Integration**: merge to `develop`, full stack locally against the UAT org, first subject in Avni | | | |
| 14:00–15:30 | `main` → `make launchpad-forms-uat`; fix deploy-only breakages until `uat-forms` serves 200 | | | |
| 15:30–16:30 | manual matrix on UAT; fix; redeploy | | | |
| 16:30–17:30 | Lane D: bundle UAT → prod, prod integration user · Lane C: `aws_alb_setup.sh` for `forms` | | | |
| 17:30–18:00 | tag `v0.1.0`, bump ref, `make launchpad-forms-prod`, smoke prod, **soft launch (internal link only)** | | | |

**Cut to day 2+:** Google-Form → Avni import for Cohort 4 (idempotent via External ID; 1:1 with the mapping); Playwright; dead-letter tooling beyond JSONL + replay; email/WhatsApp confirmation; deploy SOP in `avni-product-ops/sops/`; DPDP role-classification line; legal review of the privacy note.

**Not negotiable even in a day:** server-held credential; server-side reCAPTCHA; nginx rate limit with real IP; `/healthz` as the ALB check; Bugsnag on the service; tag-pinned prod; consent as an observation; `observations:{}` + `exitObservations:{}`; UAT as a real second instance on its own organisation.

**Expected yield by 18:00:** UAT fully live end-to-end with the matrix passing; prod up with DNS, certificate, ALB rule, nginx and the service, the prod organisation configured from the UAT bundle, `v0.1.0` pinned — soft launch only; public announcement the next morning after a fresh-eyes pass.

## 14. Risks and open items

1. **reCAPTCHA key ownership** — the website's key is domain-scoped; its secret sits in n8n. Blocks the day if unowned.
2. **`openchs-infra.pem`** is being revoked (`avni-product-ops/context/production-access.md`); the Ansible deploy needs working SSH to the reporting node — verify at 09:00.
3. **ALB script non-idempotency; unknown instance tag / security group / free priorities** — discover first (§8).
4. **`exitObservations` NPE** — pinned by a unit test.
5. **`Address` vs `Address map`** — stay on the default `version`; comment in `avni/client.ts`.
6. **Upsert overwrites** — a second submission with the same email replaces the first (accepted; said on the success screen); a stale replay clobbers newer answers (`--confirm`, same-day).
7. **Personal data** — log lines carry an email hash and the organisation name only; the JSONL is 0600 and purged after replay; no session recording; synthetic applicants only in development and tests.
8. **Shared node** — `npm ci && npm run build` runs on the reporting node next to production Metabase (as tanuh does).
9. **Host-name filter** — `avni.web.validHosts` is empty today; if it is ever set, the service is unaffected. Do not "fix" the Host header.

## 15. Process (pointer)

The platform-side process record — decision-log entry, active-projects row, the "Surveys" open decision this is the first front end of, and which `avni-product-ops` skills and commands apply — lives in `avni-product-ops` (`context/decisions-log.md`, 28 Aug 2026). The authoring pipeline there is not used for this repo: nothing in the shared platform changes.
