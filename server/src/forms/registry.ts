// Which URL code serves which form.
//
// forms.avniproject.org/<code> is the only way to reach a form: the bare
// domain deliberately serves nothing, and an unknown code is indistinguishable
// from a retired one. Codes are opaque so a form can be shared with a specific
// audience and quietly retired by removing its entry.
//
// This is obscurity, not authentication. A code that leaks is public, and
// anyone holding it can submit. It keeps the form off the open web and lets
// cohorts be addressed separately; it is not an access control.
//
// A second form is a new module plus one entry here.
import { buildFormConfig, allFields, type FieldSpec } from "./launchpad-cohort.js";
import type { Env } from "../env.js";

export interface FormModule {
  /** Stable id, echoed in the form config and used in logs. */
  id: string;
  buildConfig(e: Env): ReturnType<typeof buildFormConfig>;
  fields(): FieldSpec[];
}

const LAUNCHPAD_COHORT: FormModule = {
  id: "launchpad-cohort",
  buildConfig: (e) => buildFormConfig(e),
  fields: () => allFields(),
};

// Placeholder code for the Cohort 4 form. Replace with the real one before the
// link goes out; changing it retires the old URL immediately.
export const FORM_CODES: Record<string, FormModule> = {
  "k9m4x7qp2vhd": LAUNCHPAD_COHORT,
};

export function findForm(code: string | undefined): FormModule | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(FORM_CODES, code) ? FORM_CODES[code] : null;
}
