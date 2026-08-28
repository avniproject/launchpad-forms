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

28 Aug 2026 — design approved; build scheduled as a one-day, four-lane effort (spec §13). Nothing in `web/` or `server/` exists yet. Cohort 4 applications keep arriving on the Google Form until 25 Sep 2026 and are imported afterwards.

## Who does what on build day

- **Platform (Himesh + agents):** the page, the service, the infrastructure, UAT and prod deploys. Nupoor also holds SSH access to the node and can run the deploys.
- **Launchpad team (Nupoor):** the Avni configuration in the UAT organisation (spec §9, in that order), the two open field questions (spec §10 A/B), the manual walkthrough in the Data Entry App, and the bundle promotion to the prod organisation in the afternoon.
- **Before 09:00:** the deployer can open the reCAPTCHA entry in `vault.avniproject.org` ("Avni Signup Google Recaptcha", set up 28 Aug) — on build day it is copied into the `avni-infra` Ansible vault as `launchpad_forms_recaptcha_secret`, with the site key in `prod_vars.yml` as `launchpad_forms_recaptcha_sitekey`; and SSH to the reporting node is confirmed for whoever deploys.
