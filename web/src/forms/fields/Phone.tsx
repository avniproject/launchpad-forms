import { Box } from "@mui/material";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { FieldShell, type FieldProps } from "./FieldShell";

// react-phone-number-input emits E.164 (e.g. +919876543210) — exactly what
// the contract expects for `contactPhone`.
//
// Flags are suppressed. By default the library loads each flag as an <img>
// from purecatamphetamine.github.io, which the CSP blocks (img-src is 'self',
// data: and gstatic only) — that is what rendered a broken-image icon. The
// alternatives were worse: bundling country-flag-icons pulls in 5.3 MB of
// SVG for decoration, and widening img-src would leak every applicant's IP to
// a third-party host from a page that collects personal data. The country
// selector still lists full country names and dial codes, so nothing
// functional is lost.
const NoFlag = () => <></>;
export function Phone({ field, value, error, onChange, onBlur }: FieldProps) {
  return (
    <FieldShell field={field} error={error}>
      <Box
        sx={{
          "& .PhoneInputInput": {
            border: "1px solid",
            borderColor: error ? "error.main" : "rgba(0, 0, 0, 0.23)",
            borderRadius: "8px",
            padding: "8.5px 14px",
            fontSize: 16,
            fontFamily: "inherit",
            width: "100%",
            "&:focus": { outline: "2px solid", outlineColor: "primary.main", borderColor: "transparent" },
          },
        }}
      >
        <PhoneInput
          defaultCountry="IN"
          flagComponent={NoFlag}
          value={typeof value === "string" && value ? value : undefined}
          onChange={(v) => onChange(v ?? "")}
          onBlur={onBlur}
          aria-label={field.label}
        />
      </Box>
    </FieldShell>
  );
}
