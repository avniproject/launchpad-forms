import { Box, TextField, Typography } from "@mui/material";
import { FieldShell, type FieldProps } from "./FieldShell";
import { countWords } from "@/validation/validators";

export function Notes({ field, value, error, onChange, onBlur }: FieldProps) {
  const words = countWords(String(value ?? ""));
  const over = field.maxWords !== undefined && words > field.maxWords;
  return (
    <FieldShell field={field} error={error}>
      <TextField
        fullWidth
        multiline
        minRows={4}
        error={Boolean(error) || over}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputProps={{ "aria-label": field.label }}
      />
      {field.maxWords !== undefined && (
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 12, color: over ? "error.main" : "text.secondary", mt: 0.5 }}>
            {words}/{field.maxWords} words
          </Typography>
        </Box>
      )}
    </FieldShell>
  );
}
