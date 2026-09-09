#!/usr/bin/env bash
# Smoke test against a running service (default local dev; pass BASE_URL for UAT).
# Uses the UAT captcha bypass token; run twice and confirm exactly ONE subject
# exists in the Data Entry App (upsert on email).
#
#   BASE_URL=https://uat-forms.avniproject.org BYPASS=<token> ./scripts/smoke.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
BYPASS="${BYPASS:-${RECAPTCHA_BYPASS_TOKEN:-}}"
EMAIL="${SMOKE_EMAIL:-smoke-test@launchpad.example.org}"
# The form code; a form is reachable only at /<code>.
CODE="${FORM_CODE:-k9m4x7qp2vhd}"

echo "→ GET $BASE_URL/healthz"
curl -fsS "$BASE_URL/healthz" | tee /dev/stderr | grep -q '"ok":true'

echo "→ GET $BASE_URL/api/form-config?code=$CODE"
curl -fsS "$BASE_URL/api/form-config?code=$CODE" | grep -q '"form":"launchpad-cohort"'

if [ -z "$BYPASS" ]; then
  echo "RECAPTCHA_BYPASS_TOKEN not set — skipping submit test."
  exit 0
fi

submit() {
  curl -fsS -X POST "$BASE_URL/api/submit" -H 'content-type: application/json' -d @- <<JSON
{
  "code": "$CODE",
  "captchaToken": "$BYPASS",
  "_gotcha": "",
  "fields": {
    "email": "$EMAIL",
    "contactName": "Smoke Test",
    "contactRole": "Other",
    "contactRoleOther": "QA",
    "contactPhone": "+919999999999",
    "organisationName": "Smoke Test Org",
    "website": "Not available",
    "headquartersCity": "Bhubaneswar",
    "headquartersState": "Odisha",
    "foundationYear": 2020,
    "annualBudget": "Under ₹10 lakh",
    "priorMisToolUse": "Never used digital data collection/MIS tools",
    "avniFamiliarity": "I am completely new to Avni",
    "interventionName": "Smoke intervention",
    "programOperationalSince": "2020",
    "anticipatedDuration": "1 year",
    "fundingSecuredUntil": "2027",
    "currentChallenges": "None, this is a smoke test.",
    "pilotUseCase": "Smoke test use case.",
    "expectedFieldUsers": 1,
    "misTeam": "Yes",
    "dedicatedTeamMember": "Yes",
    "pricingUnderstood": "Yes",
    "paidPlanIntent": "Yes",
    "workshopLocation": "Bhubaneswar",
    "referralSource": "Avni website",
    "referralSourceOther": "",
    "applicationAgreement": true,
    "privacyConsent": true
  }
}
JSON
}

echo "→ POST $BASE_URL/api/submit (1st)"
submit; echo
echo "→ POST $BASE_URL/api/submit (2nd — must upsert, not duplicate)"
submit; echo
echo "OK. Now confirm exactly one '$EMAIL' subject exists in the Data Entry App."
