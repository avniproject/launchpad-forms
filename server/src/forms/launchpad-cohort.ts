// The one source of truth for what the page renders: served to the browser by
// GET /api/form-config, and the zod schema in validation/schema.ts is derived
// from the same structure. Field ids and coded option strings are part of the
// contract (docs/CONTRACT.md §1, §5) — options are the App Designer's coded
// answer names, verbatim.
import { env, windowOpen, type Env } from "../env.js";

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "notes"
  | "radio"
  | "select"
  | "checkbox";

export interface FieldSpec {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  options?: string[];
  other?: boolean;
  maxWords?: number;
  min?: number;
  max?: number;
}

export interface SectionSpec {
  id: string;
  title: string;
  description?: string;
  fields: FieldSpec[];
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry",
];

export const SECTIONS: SectionSpec[] = [
  {
    id: "contact",
    title: "Contact person",
    description: "The primary person representing your organisation for this application.",
    fields: [
      { id: "email", label: "Your email address", type: "email", required: true,
        description: "We use this address for all communication about your application. Submitting again with the same email updates your existing application." },
      { id: "contactName", label: "Name", type: "text", required: true },
      { id: "contactRole", label: "Designation / role of primary contact", type: "select", required: true, other: true,
        options: ["Founder / Co-founder", "Executive Director / CEO", "Program Manager / Lead", "M&E / MIS Manager", "Data / IT Officer", "Field Coordinator", "Other"] },
      { id: "contactPhone", label: "Primary contact mobile number (WhatsApp preferred)", type: "phone", required: true },
    ],
  },
  {
    id: "organisation",
    title: "Your organisation",
    fields: [
      { id: "organisationName", label: "Organisation", type: "text", required: true },
      { id: "website", label: "Organisation website", type: "text", required: true,
        description: "If the organisation does not have a website, share its primary public profile or write “Not available”." },
      { id: "headquartersCity", label: "Headquarters — city", type: "text", required: true,
        description: "Where is your organisation based?" },
      { id: "headquartersState", label: "Headquarters — state", type: "select", required: true,
        options: INDIAN_STATES },
      { id: "foundationYear", label: "Foundation year of the organisation", type: "number", required: true,
        min: 1800, max: 2100 },
      { id: "annualBudget", label: "Annual budget of the organisation", type: "select", required: true,
        options: ["Under ₹10 lakh", "₹10 lakh – ₹50 lakh", "₹50 lakh – ₹1 crore", "₹1 crore – ₹5 crore", "Above ₹5 crore"] },
    ],
  },
  {
    id: "programme",
    title: "Your programme & pilot",
    description: "Tell us about the intervention you would like to digitise with Avni.",
    fields: [
      { id: "priorMisToolUse", label: "Have you used any digital data collection or MIS tools before?", type: "radio", required: true,
        options: ["Yes, currently using", "Yes, have used earlier", "Never used digital data collection/MIS tools"] },
      { id: "avniFamiliarity", label: "How familiar are you with Avni?", type: "radio", required: true,
        options: [
          "I have attended an Avni demo/webinar",
          "I have explored the Avni website, videos or case studies",
          "I have heard about Avni but have not explored it in detail",
          "I am completely new to Avni",
        ] },
      { id: "interventionName", label: "Name of the intervention you plan to digitise using Avni", type: "text", required: true,
        description: "Example: tracking health outreach visits, livelihood program data, education interventions, etc." },
      { id: "programOperationalSince", label: "Since when has the program you are proposing for the pilot been operational?", type: "text", required: true },
      { id: "anticipatedDuration", label: "How long do you anticipate this program continuing?", type: "text", required: true },
      { id: "fundingSecuredUntil", label: "Until when is the funding secured for this program/project?", type: "text", required: true },
      { id: "currentChallenges", label: "What challenges are you currently facing in managing field data or monitoring or reporting?", type: "notes", required: true,
        maxWords: 200 },
      { id: "pilotUseCase", label: "Describe the pilot use case you would like to implement during the program", type: "notes", required: true,
        maxWords: 400,
        description: "Please share program activities, beneficiaries, what you’d like to track, who the users of the digital system would be, and what outcomes you expect." },
      { id: "expectedFieldUsers", label: "How many field users are expected to use the app in your pilot? (rough number)", type: "number", required: true,
        min: 1 },
    ],
  },
  {
    id: "commitment",
    title: "Team & commitment",
    fields: [
      { id: "misTeam", label: "Does your organisation have a dedicated person/team for MIS or M&E?", type: "radio", required: true,
        options: ["Yes", "No", "No, Planning to recruit in next 3 months"] },
      { id: "dedicatedTeamMember", label: "Do you have a team member who meets the following criteria?", type: "radio", required: true,
        description: "1. Can spend 6–8 hours a week working on pilot scope, Avni setup and pilot rollout during the Launchpad program timelines (October–December 2026). 2. Is comfortable with using smartphones, spreadsheets and setting up drop-down based applications like Google Forms. 3. Can attend the 2-day in-person workshop in Ahmedabad or Bhubaneswar.",
        options: ["Yes", "No"] },
      { id: "workshopLocation", label: "Which 2-day in-person workshop will your team member join?", type: "radio", required: true,
        description: "Ahmedabad: 16th & 17th November · Bhubaneswar: 19th & 20th November.",
        options: ["Ahmedabad", "Bhubaneswar"] },
      { id: "pricingUnderstood", label: "Have you looked at the pricing of Avni and is it clear to you?", type: "radio", required: true,
        description: "Details in the Avni Launchpad blog linked in the description.",
        options: ["Yes", "No"] },
      { id: "paidPlanIntent", label: "After the cohort and pilot completes successfully (mid-December), are you comfortable to take a paid plan to sustain Avni?", type: "radio", required: true,
        options: ["Yes", "No", "I would like to discuss more"] },
      { id: "referralSource", label: "How did you hear about the Avni Launchpad?", type: "radio", required: true, other: true,
        options: [
          "Avni website",
          "Samanvay / Avni team",
          "NGO partner network",
          "Social media (LinkedIn, Instagram,Twitter)",
          "Tamuku",
          "India Partner Network",
          "Reference",
          "Other",
        ] },
      { id: "applicationAgreement", label: "By submitting this application, I confirm that: the information provided above is accurate to the best of my knowledge; our organisation is genuinely interested in exploring Avni for the proposed program; and, if selected, we will make reasonable efforts to provide the time, participant availability and organisational support required to complete the Launchpad pilot.", type: "checkbox", required: true },
      { id: "privacyConsent", label: "I agree with the Avni Privacy Policy and understand that my organisation's data will be processed in accordance with applicable data protection laws.", type: "checkbox", required: true },
    ],
  },
];

export const FORM_TITLE = "Avni Launchpad 4.0 – West and East India Cohort";

export const FORM_DESCRIPTION = [
  "Digitize. Pilot. Transform.",
  "Avni Launchpad 4.0 is the West and East India Cohort, running from two regional hubs — Ahmedabad and Bhubaneswar — with a special focus on organisations working across Western and Eastern India, including those serving rural, remote and low-connectivity communities.",
  "Avni Launchpad is a cohort-based program for NGOs, social enterprises, CSR teams, funders and technology consultants who want to strengthen social-impact programs through better digital systems. Selected participants receive hands-on mentoring, implementation guidance and access to the Avni platform to design, build and test a real digital pilot for one of their own programs.",
  "Avni is best suited for field-based programs that involve regular data collection, beneficiary or household tracking, service delivery, follow-ups, monitoring and reporting.",
  "Important: Launchpad allows organisations to test Avni before deciding whether to continue with it. Participation includes free hosting, platform access, mentoring and support during the pilot period, along with a 10% discount on annual subscription plans for organisations that onboard before the cohort concludes. Continued use of Avni after the Launchpad is paid.",
  "The 2-day in-person workshops will be held in Ahmedabad (16th & 17th November) and Bhubaneswar (19th & 20th November).",
  'For questions, please contact avnipartnerships@samanvayfoundation.org with "Avni Launchpad" in the subject line. You can also WhatsApp / contact: 91-8905279137.',
  "Applications close: 5 October 2026, 11:59 PM IST. Website: https://avniproject.org/",
].join("\n\n");

export function allFields(): FieldSpec[] {
  return SECTIONS.flatMap((s) => s.fields);
}

export function buildFormConfig(e: Env = env()) {
  return {
    form: "launchpad-cohort",
    cohort: e.COHORT,
    title: FORM_TITLE,
    description: FORM_DESCRIPTION,
    open: windowOpen(e),
    closesAt: e.REG_CLOSE,
    sections: SECTIONS,
  };
}
