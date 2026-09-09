import { FormControlLabel, Radio, RadioGroup } from "@mui/material";
import { FieldShell, type FieldProps } from "./FieldShell";

// Choosing an option is self-evidently valid, so no onBlur validation here —
// calling it in the same tick as onChange would validate the stale value.
export function CodedRadio({ field, value, error, onChange, row }: FieldProps & { row?: boolean }) {
  return (
    <FieldShell field={field} error={error}>
      <RadioGroup row={row} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((option) => (
          <FormControlLabel
            key={option}
            value={option}
            control={<Radio size="small" />}
            label={option}
            sx={{ "& .MuiFormControlLabel-label": { fontSize: 14 } }}
          />
        ))}
      </RadioGroup>
    </FieldShell>
  );
}
