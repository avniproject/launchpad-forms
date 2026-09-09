# Learnings and corrections

What the build day actually taught us, written down because most of it was
discovered empirically and would otherwise be re-derived painfully. Recorded
9 Sep 2026, when the form went live end to end against the UAT organisation.

Where this contradicts `docs/superpowers/specs/2026-08-28-launchpad-forms-design.md`
or `docs/implementation-plan.md`, **this file is right** — those were written
before anything was deployed.

---

## 1. reCAPTCHA: the key *type* decides everything

This cost more time than anything else, through two wrong inferences.

- **`6L…` prefix tells you nothing.** The site key and the "secret" of a
  classic v2 pair share a prefix — but so does an Enterprise site key. We read
  a shared prefix as proof of a classic pair. It wasn't.
- **`ERROR for site owner: Invalid key type`** has two causes: an Enterprise
  key loaded by the classic `api.js`, *or* a score-based key rendered as a
  checkbox. We fixed the first and the error stayed, because it was the second.
- **A score-based key can never render as a checkbox.** No script change fixes
  that. The page must call `grecaptcha.enterprise.execute(siteKey, {action})`
  and mint a token on submit.
- **`react-google-recaptcha` cannot drive a score key.** Its invisible mode
  calls the v2 `grecaptcha.execute(widgetId)`, not `enterprise.execute`. We
  load `enterprise.js?render=<siteKey>` directly instead — see
  `web/src/captcha/enterprise.ts`.
- **`siteverify` does not validate Enterprise tokens.** Enterprise needs
  `POST /v1/projects/{project}/assessments`.
- **You cannot validate a secret with a bogus token.** Google checks the
  response token first and returns `invalid-input-response` for *any* secret,
  correct or not. We confirmed this against a deliberately wrong secret and an
  empty one — identical replies. Only a real solved token proves a credential.
- **An HTTP-referrer restriction cannot protect a server-side API key.** It
  blocks server-to-server calls (`PERMISSION_DENIED — Requests from this
  referer are blocked`), and sending one header lifts it — we demonstrated the
  bypass in one line. An **IP restriction** is the setting that protects the
  key. We send a `Referer` because this node has no stable address; that buys
  compatibility, not security.
- Google's docs note a **new key scores poorly for ~48 hours**. Provision well
  before launch day, not on it.

**The fastest route to the answer was the Cloud console screenshot.** Ask for
the key type first; do not infer it from key shapes or error strings.

## 2. nginx traps that fail silently

- **`add_header` inside a `location` cancels every inherited `add_header`.**
  `/` falls through `try_files` to `location = /index.html`, which sets
  `Cache-Control` — so the page shipped with **no CSP, no X-Frame-Options and
  no nosniff**, while the server block looked correct. The CSP is now one Jinja
  variable repeated in each location that needs it.
- **`limit_req` answers 503, not 429.** `CONTRACT.md` promises 429 and the page
  only renders "too many attempts" for 429. Set `limit_req_status 429`.
- **`set_real_ip_from` is load-bearing.** Without it nginx only ever sees the
  ALB's address, every client shares one rate-limit bucket, and the limit is
  inert while appearing configured.

## 3. Verify third-party endpoints from the built bundle, not the docs

Bugsnag calls **both** `*.bugsnag.com` and `*.bugsnag.smartbear.com` (notify,
sessions, otlp). The CSP allowed only the first. **A CSP block is silent**, so
error and performance reporting would have looked configured and reported
nothing. Found by grepping `web/dist` for hostnames — do that for any
third-party script rather than trusting its documentation.

Same class of bug: `react-phone-number-input` loads country flags as `<img>`
from `purecatamphetamine.github.io`, which the CSP blocked into a broken icon.
Flags are suppressed rather than allowed — bundling `country-flag-icons` costs
5.3 MB, and widening `img-src` would leak every applicant's IP to a third party
from a page collecting personal data.

## 4. Failures that hide behind a success screen

The error taxonomy returns **202 + a success screen** when Avni is unreachable,
because the application *is* captured. That is right, but it means several
failures are invisible by construction. Three were live:

- `appendDeadLetter` was awaited inside the `catch` with no guard. A failed
  write escaped to Fastify, the applicant got a 500 carrying the raw filesystem
  error code, and the payload was gone — while the file's own header promised
  durable capture.
- **Auth failures never paged.** `getToken` throwing became
  `AvniError(status: null)`, and the notify branch tested
  `status !== null && status < 500`. A wrong integration password would have
  dead-lettered every submission silently. `AvniError` now carries a `kind`,
  and the auth/network distinction is drawn in `token.ts` where it is known.
- **`windowOpen` failed open.** `now > new Date("garbage")` is `false`, so a
  malformed `REG_CLOSE` kept the form accepting applications past the close.
  Both ways of guessing are wrong, so `assertWindowConfig()` refuses to start.

**Rule of thumb:** wherever the applicant is shown success on a failure path,
something else must be loud. That is what Bugsnag is for here, and why the role
refuses to deploy without keys.

## 5. avni-server behaviours worth knowing

- `POST /api/subject` checks **`EditSubject`**; `POST /api/programEnrolment`
  checks **`EnrolSubject`**. Those two, nothing else — verified in
  `SubjectApiController:125` and `ProgramEnrolmentApiController:64`.
  "Register subject" is not what the API checks.
- **`allowMultipleEnrolments` is not enforced on the external API path.**
  `post` calls `programEnrolmentService.save`, which never calls
  `validateProgramEnrolmentSave`. It *is* enforced in the CSV importer
  (`ProgramEnrolmentRowCreator:84`) and the Data Entry App, so turning it off
  breaks the bulk-upload fallback and re-application, not our writes.
- **Upsert is keyed only on External ID**, which here is the normalised email.
  Submitting again with the same email updates that subject in place —
  including overwriting the phone. Nothing dedupes on phone or name.
- The token endpoint returns **`{ authToken }`**, not `{ token }` as the design
  assumed.

## 6. Operational

- **Ansible deploys from git, so push before you deploy.** We set
  `RECAPTCHA_REFERER` in the rendered config and deployed in the same breath,
  before pushing the code that reads it. The node ran an older build with the
  new variable and kept failing, which looked like the fix not working.
- **`ansible-vault edit` needs a TTY.** Non-interactively: decrypt to a
  scratch file, patch, re-encrypt, shred.
- **Bundle audits must filter `voided`.** Our first audit counted a voided
  form element as a live duplicate.
- **A bundle import replaces the org settings block wholesale** — it does not
  merge (`avni-product-ops/sops/tanuh-prod-deploy.md`, golden rule 1).
  Reconcile on UAT *before* exporting.
- **The node has no Elastic IP** (the account is at its limit, with 10 of 15
  unassociated). Its address survives reboots but not a stop/start, which
  would break both the inventory entry and any IP-based API key restriction.
- **`POST /api/subject` is the slow step**, 626–1292 ms against ~150–330 ms for
  the enrolment, with one submission at 13.6 s. That is avni-server near its
  capacity line during working hours, not this service. Per-phase timing is in
  the submission log so this stays attributable.

## 7. Mistakes made here, so they are not repeated

- **A credential was committed to this public repo in plaintext** (`d8c8df4`,
  in the README open-items table) and pushed. It stayed world-readable until
  removed, and remains in git history. The password was rotated; removal from
  HEAD does not undo exposure. **Never write a secret into a repo file, not
  even to describe it as needing rotation.**
- Two wrong inferences about the reCAPTCHA key type (§1) delayed the fix.
  Evidence from the console would have settled it immediately.
- The first attempt at the auth/network distinction classified *all* token
  failures as auth. The second test — "a transient outage must NOT page" —
  caught it. Write the negative test alongside the positive one.

## 8. Corrections to the older documents

`docs/CONTRACT.md` is current. The design spec and implementation plan predate
the deployment and are stale in these specifics:

| Stale claim | Actual |
|---|---|
| Subject type `Applicant`, program `Launchpad` | `Organisation`, `Launchpad Application` |
| Integration user `launchpad-forms@launchpaduat` | `apiuser@launchpadUat` (note the capital U) |
| Registration closes 25 Sep 2026 | 5 Oct 2026 |
| UAT is a second hosted instance on `uat-forms` | One instance, switched between organisations by `launchpad_forms_avni_org` |
| Page hosted on the reporting node | Dedicated node `i-08ea4a1c0da2befa1` — the reporting box already spikes to ~99% CPU beside a memory-sensitive Metabase |
| reCAPTCHA v2 checkbox | reCAPTCHA Enterprise, score-based, no widget |
| Reachable at `/` and `/launchpad` | Only at `/<code>`; the bare domain serves no form |
