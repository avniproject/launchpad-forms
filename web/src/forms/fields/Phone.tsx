import { Box } from "@mui/material";
import PhoneInput, { getCountryCallingCode, type FlagProps } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { FieldShell, type FieldProps } from "./FieldShell";

// react-phone-number-input emits E.164 (e.g. +919876543210) — exactly what
// the contract expects for `contactPhone`.
//
// The country selector shows the dial code where the flag would go. The
// library's own flags load as an <img> from purecatamphetamine.github.io,
// which the CSP blocks (img-src is 'self', data: and gstatic only) — that
// rendered a broken-image icon, and suppressing it left an empty box. The
// remaining options were worse: bundling country-flag-icons pulls in 5.3 MB of
// SVG for decoration, and widening img-src would leak every applicant's IP to
// a third-party host from a page that collects personal data. The dial code
// needs no request and says something the flag never did — which prefix the
// number will carry.
function DialCode({ country }: FlagProps) {
  let code: string | null = null;
  try {
    code = country ? `+${getCountryCallingCode(country)}` : null;
  } catch {
    // A country the metadata has no calling code for: show nothing rather
    // than break the field.
    code = null;
  }
  return <>{code}</>;
}

export function Phone({ field, value, error, onChange, onBlur }: FieldProps) {
  return (
    <FieldShell field={field} error={error}>
      <Box
        sx={{
          // The icon slot is sized for a flag; let the dial code set its own
          // width and drop the flag's border/loading background.
          "& .PhoneInputCountryIcon": {
            width: "auto",
            height: "auto",
            boxShadow: "none",
            backgroundColor: "transparent",
            fontSize: 15,
            // Keeps +1 and +971 from shifting the input as the country changes.
            fontVariantNumeric: "tabular-nums",
            color: "text.secondary",
            whiteSpace: "nowrap",
          },
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
          flagComponent={DialCode}
          value={typeof value === "string" && value ? value : undefined}
          onChange={(v) => onChange(v ?? "")}
          onBlur={onBlur}
          aria-label={field.label}
        />
      </Box>
    </FieldShell>
  );
}
