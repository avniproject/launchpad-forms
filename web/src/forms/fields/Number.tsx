import { TextField } from "@mui/material";
import { FieldShell, type FieldProps } from "./FieldShell";

export function NumberField({ field, value, error, onChange, onBlur }: FieldProps) {
  return (
    <FieldShell field={field} error={error}>
      <TextField
        fullWidth
        size="small"
        type="number"
        error={Boolean(error)}
        value={value === undefined || value === "" ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Keep "" while the field is being cleared; otherwise store a number
          // so the submit payload carries real numbers, not numeric strings.
          onChange(raw === "" ? "" : Number(raw));
        }}
        onBlur={onBlur}
        inputProps={{ inputMode: "numeric", min: field.min, max: field.max, "aria-label": field.label }}
      />
    </FieldShell>
  );
}
