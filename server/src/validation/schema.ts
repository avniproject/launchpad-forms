// The submit-body schema, derived from the same field specs the page renders —
// so the page and the service can never disagree about what's valid.
import { z } from "zod";
import { allFields, type FieldSpec } from "../forms/launchpad-cohort.js";

export type FieldValues = Record<string, string | number | boolean>;

export interface SubmitBody {
  captchaToken: string;
  _gotcha?: string;
  fields: FieldValues;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function baseFieldSchema(field: FieldSpec): z.ZodTypeAny {
  switch (field.type) {
    case "email":
      return z.string().trim().min(1, "Required").email("Enter a valid email address");
    case "phone":
      // The page sends E.164 (react-phone-number-input).
      return z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid mobile number");
    case "number": {
      let n = z.number().int("Enter a whole number");
      if (field.min !== undefined) n = n.min(field.min, `Must be ${field.min} or more`);
      if (field.max !== undefined) n = n.max(field.max, `Must be ${field.max} or less`);
      return n;
    }
    case "notes": {
      let s = z.string().trim().min(1, "Required");
      if (field.maxWords !== undefined) {
        const max = field.maxWords;
        s = s.refine((v) => countWords(v) <= max, `Please keep this under ${max} words`) as never;
      }
      return s;
    }
    case "radio":
    case "select":
      return z.enum(field.options as [string, ...string[]]);
    case "checkbox":
      return field.required ? z.literal(true, { errorMap: () => ({ message: "This confirmation is required" }) }) : z.boolean();
    case "text":
    default:
      return z.string().trim().min(1, "Required").max(5000);
  }
}

// `required` was only honoured for checkboxes: every other type carried an
// unconditional .min(1)/regex/enum, so a field declared optional would render
// without a * , pass client validation blank, and then be rejected here with
// "Required" — an error the applicant cannot clear.
function fieldSchema(field: FieldSpec): z.ZodTypeAny {
  const base = baseFieldSchema(field);
  if (field.required || field.type === "checkbox") return base;
  return z.union([z.literal(""), base]).optional();
}

function buildFieldsSchema() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of allFields()) {
    shape[field.id] = fieldSchema(field);
    if (field.other) shape[`${field.id}Other`] = z.string().trim().max(500).optional().default("");
  }
  return z
    .object(shape)
    .superRefine((values, ctx) => {
      // `<id>Other` becomes required when the last option ("Other") is chosen.
      for (const field of allFields()) {
        if (!field.other || !field.options?.length) continue;
        const last = field.options[field.options.length - 1];
        if (values[field.id] === last && !String(values[`${field.id}Other`] ?? "").trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${field.id}Other`], message: "Please specify" });
        }
      }
    });
}

export const submitSchema = z.object({
  captchaToken: z.string().min(1),
  _gotcha: z.string().optional().default(""),
  fields: buildFieldsSchema(),
});

// zod issues → { fieldId: firstMessage } for the page to place on fields.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    // Issues on body.fields.<id>; ignore top-level ones (captcha handled separately).
    const [root, id] = issue.path;
    if (root === "fields" && typeof id === "string" && !(id in out)) out[id] = issue.message;
  }
  return out;
}
