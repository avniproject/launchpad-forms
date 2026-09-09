// Shapes of GET /api/form-config and POST /api/submit — see docs/CONTRACT.md.
// The server owns this contract; the page only renders what it is given.

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
  // On a radio/select: the last option reveals a free-text `<id>Other` field.
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

export interface FormConfig {
  form: string;
  cohort: string;
  // Page heading and the Google-Forms-style intro under it. Paragraphs in the
  // description are separated by blank lines; URLs/emails get auto-linked.
  title?: string;
  description?: string;
  open: boolean;
  closesAt: string;
  sections: SectionSpec[];
}

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;
export type FieldErrors = Record<string, string>;

export interface SubmitOk {
  code?: "CREATED" | "QUEUED";
  reference: string;
}
