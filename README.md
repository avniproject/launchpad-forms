# launchpad-forms

**Live form: <https://forms.avniproject.org/k9m4x7qp2vhd>**

A form is reachable only at `/<code>`. The bare domain serves no form, and an
unknown or retired code is answered identically to a missing one, so codes
cannot be probed. The code above is a placeholder — replace it in
`server/src/forms/registry.ts` before the link goes out; changing it retires
the old URL immediately. This is obscurity, not authentication: a code that
leaks is public.

The public signup page for the **Avni Launchpad** cohort programme — `forms.avniproject.org`. An organisation fills one form, with no login; the submission becomes an Applicant and a Launchpad enrolment in the `Avni Launchpad` organisation on Avni, and the team takes it from there in the Data Entry App and Metabase.

## Start here

| Read | For |
|---|---|
| [`docs/superpowers/specs/2026-08-28-launchpad-forms-design.md`](docs/superpowers/specs/2026-08-28-launchpad-forms-design.md) | The approved design: decisions, architecture, repo layout, service, page, infrastructure, Avni configuration, field inventory, testing, build-day plan, risks |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | The HTTP contract between the page and the service, and the **field → concept table** the App Designer configuration must match |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | The Avni-side model — organisation, program, encounters, status-by-evidence, Metabase — and the go-live checklist. Phases 4–5 point at the spec |

## Shape

```
web/     Vite + React + MUI static page, styled like avniproject.org/signup
server/  small Fastify service: verifies the captcha, holds the Avni credential,
         gets a token from POST /api/user/generateToken, posts subject + enrolment
```

Both are served from one nginx on Avni's reporting node behind the shared load balancer, deployed by `avni-infra` (`roles/launchpad_forms`, cloned from the tanuh-webapp role). UAT (`uat-forms.avniproject.org`, tracks `main`, writes to the `Avni Launchpad UAT` organisation) and prod (`forms.avniproject.org`, pinned to a release tag).

## Status

**9 Sep 2026 — deployed and verified end-to-end against the UAT organisation.**
`forms.avniproject.org` is wired through `reporting-alb` (rule 33 → target group
`launchpad-forms`, healthy) to a **dedicated t3.medium**, `i-08ea4a1c0da2befa1` —
not the reporting node, which already spikes to ~99% CPU beside a
memory-sensitive Metabase. Four smoke submissions returned the same reference
(`LP-dc5d223b`), proving the idempotent upsert; zero dead letters.

**Public DNS is deliberately not created yet** — that is the soft-launch call.
Verify meanwhile with
`curl --resolve forms.avniproject.org:443:<alb-ip> https://forms.avniproject.org/healthz`.

There is **one** hosted instance, not two: it is pointed at `Avni Launchpad UAT`
for validation and then switched to the live org with a single variable
(`launchpad_forms_avni_org`). Operations are in [`docs/RUNBOOK.md`](RUNBOOK.md).

Code: 37 server tests, both packages lint/typecheck/build clean. The nine
findings from the review of the original implementation commit are fixed.
CircleCI is now the CI, matching the rest of the Avni repos.

## Open items before public launch (single source of truth — update here, not in chat)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Lane C: `avni-infra` role, nginx, ALB, dedicated node | Himesh / platform | ☑ **done** — role, playbook, host group, SG, target group, listener rule 33 |
| 2 | Bugsnag projects + keys | Team | ☑ **done** — browser `314a2520…` in `prod_vars.yml`, Node `c2c9febf…` in the vault |
| 3 | **Real reCAPTCHA secret + site key**; confirm the domain list covers `forms.avniproject.org` | Lane C + Google admin owner | ☐ **blocking** — until then `verifyCaptcha` fails closed and no real submission can succeed |
| 4 | Dead-letter alerting to email/Slack; interim: daily `wc -l` (see RUNBOOK) | Ops | ☐ day-2 |
| 5 | **Rotate the UAT integration password — COMPROMISED.** It was committed to this public repo in plaintext on 9 Sep 2026 (commit `d8c8df4`) and remains in git history; rotation is a security fix, not housekeeping. Also create the prod org + user with a strong password | Nupoor | ☐ **blocking** |
| 6 | Updated banner image for "West and East India" (page still ships the Eastern-India banner) | Launchpad team | ☐ pending |
| 7 | UAT → prod bundle export/import + prod org Metabase setup | Nupoor | ☐ — see the bundle-import hazard below |
| 8 | Cohort 4 Google Form → Avni import script | Day-2 | ☐ not started |
| 9 | Public DNS record for `forms.avniproject.org` → soft launch | Himesh | ☐ deliberate hold |
| 10 | **UAT org config fixes** — `API Integration` group has `hasAllPrivileges: true`; `Referral source` is on the enrolment form twice; no catchment exists; `allowMultipleEnrolments` is off | Nupoor | ☐ **must land before the prod bundle export** |
| 11 | Delete `.github/workflows/ci.yml` once CircleCI has run green | Himesh | ☐ |

**Bundle-import hazard** (`avni-product-ops/sops/tanuh-prod-deploy.md`, golden
rule 1): a bundle upload **replaces the org settings block completely — it does
not merge**. Reconcile on UAT *before* export: diff UAT's settings against
prod's, adjust UAT to the intended prod end-state, export, then restore
UAT-only values. Never hand-edit a bundle zip.

## Who does what on build day

- **Platform (Himesh + agents):** the page, the service, the infrastructure, UAT and prod deploys. Nupoor also holds SSH access to the node and can run the deploys.
- **Launchpad team (Nupoor):** the Avni configuration in the UAT organisation (spec §9, in that order), the two open field questions (spec §10 A/B), the manual walkthrough in the Data Entry App, and the bundle promotion to the prod organisation in the afternoon.
- **Before 09:00:** the deployer can open the reCAPTCHA entry in `vault.avniproject.org` (the team's Bitwarden; "Avni Signup Google Recaptcha", set up 28 Aug) — on build day it is copied into the `avni-infra` Ansible vault as `launchpad_forms_recaptcha_secret`, with the site key in `prod_vars.yml` as `launchpad_forms_recaptcha_sitekey`; and SSH to the reporting node is confirmed for whoever deploys.
