import { Checkbox as MuiCheckbox, FormControlLabel, Link } from "@mui/material";
import type { ReactNode } from "react";
import { FieldShell, type FieldProps } from "./FieldShell";

const PRIVACY_POLICY_TEXT = "Avni Privacy Policy";
const PRIVACY_POLICY_URL = "https://avniproject.org/privacy-policy";

// The consent label references the Avni Privacy Policy; linkify that phrase
// (same behaviour as the website's signup form).
function renderLabel(label: string): ReactNode {
  const index = label.indexOf(PRIVACY_POLICY_TEXT);
  if (index === -1) return label;
  return (
    <>
      {label.slice(0, index)}
      <Link href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
        {PRIVACY_POLICY_TEXT}
      </Link>
      {label.slice(index + PRIVACY_POLICY_TEXT.length)}
    </>
  );
}

// Ticking the box is self-evidently valid, so no onBlur validation here —
// calling it in the same tick as onChange would validate the stale value.
export function Checkbox({ field, value, error, onChange }: FieldProps) {
  return (
    <FieldShell field={field} error={error} hideLabel>
      <FormControlLabel
        sx={{ alignItems: "flex-start", "& .MuiFormControlLabel-label": { fontSize: 14, pt: 1 } }}
        control={<MuiCheckbox checked={value === true} onChange={(e) => onChange(e.target.checked)} />}
        label={
          <>
            {renderLabel(field.label)}
            {field.required ? " *" : ""}
          </>
        }
      />
    </FieldShell>
  );
}
