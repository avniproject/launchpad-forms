import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { FieldSpec, FieldValue } from "@/forms/types";

export interface FieldProps {
  field: FieldSpec;
  value: FieldValue | undefined;
  error?: string;
  onChange: (value: FieldValue) => void;
  onBlur: () => void;
}

interface ShellProps {
  field: FieldSpec;
  error?: string;
  // Checkbox renders its own label next to the box; everything else gets a
  // label row above the control.
  hideLabel?: boolean;
  children: ReactNode;
}

// Label-above-input layout, as on avniproject.org/signup. The wrapper carries
// id="field-<id>" so submit-time validation can scroll to the first error.
export function FieldShell({ field, error, hideLabel, children }: ShellProps) {
  return (
    <Box id={`field-${field.id}`} sx={{ mb: 3 }}>
      {!hideLabel && (
        <Typography component="label" sx={{ display: "block", fontSize: 14, fontWeight: 600, mb: 0.5 }}>
          {field.label}
          {field.required ? " *" : ""}
        </Typography>
      )}
      {field.description && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1, whiteSpace: "pre-line" }}>
          {field.description}
        </Typography>
      )}
      {children}
      {error && (
        <Typography sx={{ color: "error.main", fontSize: 12, mt: 0.5 }}>{error}</Typography>
      )}
    </Box>
  );
}
