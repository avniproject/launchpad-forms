# launchpad-forms

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

8 Sep 2026 — both code lanes are implemented and verified end-to-end locally (`make help` lists all targets). **Lane A (`web/`)**: form rendered from `/api/form-config`, validation, draft, captcha, banner + Google-Form intro, screens, analytics, built-in dev API mock. **Lane B (`server/`)**: Fastify service — form-config, submit pipeline (honeypot → zod → window → captcha → token → subject → enrolment), dead-letter + `scripts/replay.mjs`, `scripts/smoke.sh`, 30 vitest/nock tests. Spec §10 questions A/B are resolved (City + State split; budget bands) — see CONTRACT.md §5. **Not done:** the Avni organisations + App Designer config (Lane D, spec §9 — blocks real end-to-end testing), infra/deploy (Lane C, spec §8), and the day-2 items (Google Form import, Playwright). Cohort 4 applications keep arriving on the Google Form until 25 Sep 2026 and are imported afterwards.

## Open items before public launch (single source of truth — update here, not in chat)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Lane C: `avni-infra` role, nginx, ALB, DNS for `uat-forms` + `forms` (spec §8) | Himesh / platform | ☐ not started |
| 2 | **Bugsnag project + keys** (server `BUGSNAG_KEY`, web `VITE_BUGSNAG_KEY`) — without these, failures are silent until someone reads logs | Team — decide owner | ☐ not started |
| 3 | Real reCAPTCHA keys in deploy env; confirm domain list includes both host names (spec risk #1) | Lane C + whoever holds Google admin | ☐ not started |
| 4 | Dead-letter alerting to email/Slack (spec go-live item); interim: daily `wc -l` on the JSONL during the window | Ops | ☐ day-2 |
| 5 | Rotate UAT integration user password (current one passed through chat); create separate prod org + user with strong password | Nupoor | ☐ pending |
| 6 | Updated banner image + Google Form copy for "West and East India" (page still shows the Eastern-India banner) | Launchpad team | ☐ pending |
| 7 | UAT → prod bundle export/import + prod org Metabase setup (spec §9.9–9.10) | Nupoor | ☐ after UAT sign-off |
| 8 | Cohort 4 Google Form → Avni import script (after 5 Oct close) | Day-2 | ☐ not started |
| 9 | Manual test matrix on deployed UAT (spec §11), then tag `v0.1.0` for prod | All | ☐ blocked on #1 |

Done and verified: web app, service, UAT org config, full browser→service→Avni E2E with idempotent upsert (9 Sep).

## Who does what on build day

- **Platform (Himesh + agents):** the page, the service, the infrastructure, UAT and prod deploys. Nupoor also holds SSH access to the node and can run the deploys.
- **Launchpad team (Nupoor):** the Avni configuration in the UAT organisation (spec §9, in that order), the two open field questions (spec §10 A/B), the manual walkthrough in the Data Entry App, and the bundle promotion to the prod organisation in the afternoon.
- **Before 09:00:** the deployer can open the reCAPTCHA entry in `vault.avniproject.org` (the team's Bitwarden; "Avni Signup Google Recaptcha", set up 28 Aug) — on build day it is copied into the `avni-infra` Ansible vault as `launchpad_forms_recaptcha_secret`, with the site key in `prod_vars.yml` as `launchpad_forms_recaptcha_sitekey`; and SSH to the reporting node is confirmed for whoever deploys.
