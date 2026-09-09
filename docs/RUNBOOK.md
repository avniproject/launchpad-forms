# Runbook — launchpad-forms in production

Operating the public signup page and its service during a cohort window.
Written from the live deployment, 9 Sep 2026.

## The deployment at a glance

| Thing | Value |
|---|---|
| Host | `i-08ea4a1c0da2befa1`, t3.medium, ap-south-1b, `13.233.115.61` — dedicated, nothing else runs on it |
| SSH | `ssh -i ~/.ssh/openchs-infra.pem ubuntu@13.233.115.61` (SG allows 22 from the admin IP only) |
| Public URL | `forms.avniproject.org` → `reporting-alb` listener rule priority 33 → target group `launchpad-forms` → nginx :8090 |
| TLS | The ALB's existing `*.avniproject.org` wildcard, already the 443 listener's default certificate. No per-host cert |
| nginx | site `/etc/nginx/sites-available/launchpad-forms.conf`, docroot `/var/www/launchpad-forms` |
| Service | systemd unit `launchpad-forms-svc`, Fastify on `127.0.0.1:4000` |
| Env file | `/etc/launchpad-forms.conf` — 0600, root. Rendered by Ansible; editing it on the host is overwritten by the next deploy |
| Build dir | `/var/lib/launchpad-forms-build` (git checkout, `web/` and `server/` built in place) |
| Dead letters | `/var/lib/launchpad-forms/dead-letter.jsonl`, 0600 — the unit's only writable path |
| Deploy from | `avni-infra/configure`, `prod_launchpad_forms_servers.yml`, host group `launchpad_forms_server` |

**One instance, two organisations.** There is no separate UAT host. The same
deployment is pointed at the `Avni Launchpad UAT` organisation for validation
and then switched to the live one. `launchpad_forms_avni_org` is the only
switch — it derives the integration user, the captcha bypass, the Bugsnag
release stage and the liveness ping together, so they cannot be half-flipped.

```
make launchpad-forms-uat-org   # -> Avni Launchpad UAT, bypass on, no liveness ping
make launchpad-forms-prod      # -> Avni Launchpad (live), bypass off, ping on, pinned tag
```

Both need `VAULT_PASSWORD_FILE=~/.ssh/infra-valut-pwd-file`.

## Health

```bash
curl -s https://forms.avniproject.org/healthz          # {"ok":true,"cohort":...,"open":...,"tokenCached":...}
ssh … 'curl -s localhost:4000/healthz'                 # the service, bypassing nginx
ssh … 'systemctl status launchpad-forms-svc'
aws elbv2 describe-target-health --region ap-south-1 \
  --target-group-arn arn:aws:elasticloadbalancing:ap-south-1:118388513628:targetgroup/launchpad-forms/16ac12c7731c16ba
```

`/healthz` deliberately never calls Avni — the ALB health check must not go red
because Avni is briefly unreachable. `open:false` means the registration window
has closed, or `REG_CLOSE` is wrong.

## Logs

```bash
ssh … 'sudo journalctl -u launchpad-forms-svc -f'                    # one line per submission
ssh … 'sudo tail -f /var/log/nginx/launchpad-forms-upstream.log'     # rt/uct/urt timing per request
```

A submission line carries `{submissionId, emailHash, orgName, outcome, ms}` and
deliberately no raw email, phone or free text. `outcome` is one of `created`,
`queued`, `honeypot`, `validation_failed`, `window_closed`, `captcha_failed`,
`dead_letter_failed`, `internal_error`.

**`dead_letter_failed` is the one to page on.** It means Avni rejected the
submission *and* the dead-letter write also failed, so the application was not
captured anywhere. The applicant saw an error and can retry; check disk and the
permissions on `/var/lib/launchpad-forms` immediately.

## Dead letters — check, replay, purge

An Avni 4xx or a persistent 5xx returns **202** and the applicant still sees the
success screen, because the application *is* durably captured. Nothing else
tells you this happened except Bugsnag and this file, so check it daily during
the window.

```bash
# depth
ssh … 'sudo wc -l < /var/lib/launchpad-forms/dead-letter.jsonl'

# what failed, without dumping personal data — replay.mjs dry-runs by default
# and prints submissionId, receivedAt, cohort and the error for each line.
# (jq is deliberately not installed on this host.)
ssh … 'cd /var/lib/launchpad-forms-build/server && sudo env \
  $(sudo grep -E "^(AVNI_BASE_URL|AVNI_USERNAME|AVNI_PASSWORD|DEAD_LETTER_PATH)=" /etc/launchpad-forms.conf | xargs) \
  node scripts/replay.mjs'

# then actually send them (idempotent upserts make this safe)
ssh … 'cd /var/lib/launchpad-forms-build/server && sudo env \
  $(sudo grep -E "^(AVNI_BASE_URL|AVNI_USERNAME|AVNI_PASSWORD|DEAD_LETTER_PATH)=" /etc/launchpad-forms.conf | xargs) \
  node scripts/replay.mjs --confirm'

# purge once replayed — the file holds full personal data
ssh … 'sudo shred -u /var/lib/launchpad-forms/dead-letter.jsonl'
```

**Replay the same day.** A replay overwrites whatever the applicant has
submitted since, because both Avni calls upsert on External ID. `replay.mjs`
prints each payload's `receivedAt` and requires `--confirm` for this reason.

A 4xx in the file almost always means a **concept name no longer matches** the
App Designer — every submission will fail the same way until it is fixed. The
error line names the concept.

## Switching the live organisation

Before `make launchpad-forms-prod`:

1. **Purge the dead-letter file.** Any line left from UAT-org validation would
   be replayed into the live funnel as a real applicant.
2. Confirm `launchpad_forms_prod_avni_password` and `launchpad_forms_recaptcha_secret`
   are in `prod-secret-vars.yml.enc`, and `launchpad_forms_recaptcha_sitekey` is
   set in `prod_vars.yml`.
3. Confirm the reCAPTCHA key's domain list includes `forms.avniproject.org`.
4. Re-check every concept name in the prod organisation against
   `server/src/mapping/launchpad-cohort.map.ts`.

The role refuses to deploy to the live organisation with a captcha bypass token
set, and refuses to deploy at all without Bugsnag keys. Both guards are
deliberate; override only with `-e launchpad_forms_require_bugsnag=false` and
only knowingly.

## Rotating the integration password

```
Avni admin (App Designer) → change the user's password
→ ansible-vault edit configure/group_vars/prod-secret-vars.yml.enc
     launchpad_forms_uat_avni_password / launchpad_forms_prod_avni_password
→ make launchpad-forms-prod        # re-renders /etc/launchpad-forms.conf, restarts the unit
```

The service caches its Avni token for 50 minutes, so a rotation takes effect on
the restart, not an hour later.

## Changing the registration window

`REG_CLOSE` lives in `configure/roles/launchpad_forms/defaults/main.yml`
(ISO 8601 with an offset, e.g. `2026-10-05T23:59:59+05:30`). Change it and
redeploy. **The service refuses to start on an unparseable date** — that is
deliberate: silently accepting applications past the close, or silently
turning away real ones, are both worse than a failed deploy. If the unit
restart-loops after a window change, that is why; check
`journalctl -u launchpad-forms-svc`.

## Rollback

Prod is pinned to a release tag in `prod_launchpad_forms_servers.yml`. Roll back
by setting `launchpad_forms_git_ref` to the previous tag and re-running
`make launchpad-forms-prod`.

## Known gaps

- **No CloudWatch memory metrics** on this host — no CWAgent is installed
  anywhere in the fleet. CPU and disk only.
- **Auto-assigned public IP, not an Elastic IP.** The account is at its EIP
  limit (10 of 15 unassociated). The address survives reboots but not a
  stop/start; if the instance is ever stopped, the inventory entry in
  `configure/inventory/prod` must be updated.
- **No Playwright / browser tests.** `web/` has no test suite at all; the 37
  tests are all server-side.
- **DNS for `forms.avniproject.org` is not created yet** — the ALB rule and
  target group exist and are healthy, but the public record is a deliberate
  soft-launch decision. Verify without it using
  `curl --resolve forms.avniproject.org:443:<alb-ip> https://forms.avniproject.org/healthz`.
