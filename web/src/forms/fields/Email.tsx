import { TextField } from "@mui/material";
import { FieldShell, type FieldProps } from "./FieldShell";

export function Email({ field, value, error, onChange, onBlur }: FieldProps) {
  return (
    <FieldShell field={field} error={error}>
      <TextField
        fullWidth
        size="small"
        type="email"
        autoComplete="email"
        error={Boolean(error)}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputProps={{ "aria-label": field.label }}
      />
    </FieldShell>
  );
}
