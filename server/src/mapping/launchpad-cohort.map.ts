// Field id → App Designer concept name. These strings are an API contract
// (docs/CONTRACT.md §5): a mismatch fails every submission with
// "Concept with name=X not found". Never edit casually.

// Registration form (Applicant). organisationName is NOT here — it becomes the
// subject's name ("First name" in the API payload).
export const REGISTRATION_CONCEPTS: Record<string, string> = {
  contactName: "Contact person name",
  email: "Contact email",
  contactPhone: "Contact phone",
  contactRole: "Contact role",
  contactRoleOther: "Contact role other",
  website: "Organisation website",
  headquartersCity: "Headquarters city",
  headquartersState: "State",
  foundationYear: "Foundation year",
  annualBudget: "Annual budget",
  privacyConsent: "Consent to data use",
};

// "Launchpad Application" enrolment form. Cohort is added by the service from
// the COHORT env — never user-entered.
export const ENROLMENT_CONCEPTS: Record<string, string> = {
  priorMisToolUse: "Prior MIS tool use",
  avniFamiliarity: "Avni familiarity",
  interventionName: "Intervention name",
  programOperationalSince: "Program operational since",
  anticipatedDuration: "Anticipated program duration",
  fundingSecuredUntil: "Funding secured until",
  currentChallenges: "Current challenges",
  pilotUseCase: "Pilot use case",
  expectedFieldUsers: "Expected field users",
  misTeam: "MIS/M&E team",
  dedicatedTeamMember: "Dedicated team member available",
  pricingUnderstood: "Pricing understood",
  paidPlanIntent: "Paid plan intent",
  workshopLocation: "Workshop location",
  referralSource: "Referral source",
  referralSourceOther: "Referral source other",
  applicationAgreement: "Application agreement",
};
