import { MenuItem, TextField } from "@mui/material";
import { FieldShell, type FieldProps } from "./FieldShell";

// Choosing an option is self-evidently valid, so no onBlur validation here —
// calling it in the same tick as onChange would validate the stale value.
export function CodedSelect({ field, value, error, onChange }: FieldProps) {
  return (
    <FieldShell field={field} error={error}>
      <TextField
        select
        fullWidth
        size="small"
        error={Boolean(error)}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        SelectProps={{ displayEmpty: true }}
        inputProps={{ "aria-label": field.label }}
      >
        <MenuItem value="" disabled>
          <em>Select…</em>
        </MenuItem>
        {(field.options ?? []).map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    </FieldShell>
  );
}
