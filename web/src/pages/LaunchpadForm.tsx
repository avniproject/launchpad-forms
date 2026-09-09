import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Box, Button, CircularProgress, Container, Link, Paper, Typography } from "@mui/material";
import ReCAPTCHA from "react-google-recaptcha";
import logo from "@/assets/avni-logo.png";
import { useAsync } from "@/hooks/useAsync";
import { FormRenderer } from "@/forms/FormRenderer";
import { effectiveFields, otherActive } from "@/forms/effectiveFields";
import type { FieldErrors, FieldValue, FieldValues, FormConfig, SubmitOk } from "@/forms/types";
import { validateField } from "@/validation/validators";
import { track } from "@/analytics";
import { SuccessScreen } from "./SuccessScreen";
import { ClosedScreen } from "./ClosedScreen";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const DRAFT_KEY = "launchpad-draft-v1";

// Google's universal reCAPTCHA v2 TEST key — always passes, dev builds only.
// Production builds must set VITE_RECAPTCHA_SITEKEY (the public half of the
// "Avni Signup Google Recaptcha" pair).
const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const SITE_KEY =
  (import.meta.env.VITE_RECAPTCHA_SITEKEY as string | undefined) || (import.meta.env.DEV ? TEST_SITE_KEY : "");

function loadDraft(): FieldValues {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FieldValues) : {};
  } catch {
    return {};
  }
}

async function fetchFormConfig(): Promise<FormConfig> {
  const res = await fetch(`${API_BASE}/api/form-config`);
  if (!res.ok) throw new Error(`Could not load the form (HTTP ${res.status})`);
  return res.json() as Promise<FormConfig>;
}

function scrollToField(id: string): void {
  document.getElementById(`field-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Turn bare URLs and email addresses in the intro text into links.
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <Link key={i} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </Link>
      );
    }
    if (/^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(part)) {
      return (
        <Link key={i} href={`mailto:${part}`}>
          {part}
        </Link>
      );
    }
    return part;
  });
}

interface ErrorBody {
  code?: string;
  fieldErrors?: FieldErrors;
  closesAt?: string;
}

export function LaunchpadForm() {
  const { data: config, error: configError, loading } = useAsync(fetchFormConfig, []);

  const [values, setValues] = useState<FieldValues>(loadDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitOk | null>(null);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [gotcha, setGotcha] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // The cohort banner lives at web/public/banner.png (copied verbatim into
  // dist/). It's referenced by URL, not imported, so a missing file hides the
  // banner instead of breaking the build.
  const [banner, setBanner] = useState<"unknown" | "loaded" | "missing">("unknown");
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const viewTracked = useRef(false);

  useEffect(() => {
    if (config && !viewTracked.current) {
      viewTracked.current = true;
      track("form_viewed", { cohort: config.cohort });
    }
  }, [config]);

  // Draft, debounced. The captcha token lives in separate state and is never
  // persisted.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      } catch {
        // Storage full/unavailable — the draft is a convenience, not a promise.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [values]);

  const handleChange = (id: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleBlur = (id: string) => {
    if (!config) return;
    const spec = effectiveFields(config, values).find((f) => f.id === id);
    if (!spec) return;
    const message = validateField(spec, values[id]);
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  };

  const resetCaptcha = () => {
    recaptchaRef.current?.reset();
    setCaptchaToken(null);
  };

  const handleSubmit = async () => {
    if (!config || submitting) return;

    const fields = effectiveFields(config, values);
    const newErrors: FieldErrors = {};
    for (const field of fields) {
      const message = validateField(field, values[field.id]);
      if (message) newErrors[field.id] = message;
    }
    setErrors(newErrors);
    const firstInvalid = fields.find((f) => newErrors[f.id]);
    if (firstInvalid) {
      scrollToField(firstInvalid.id);
      return;
    }

    if (!captchaToken) {
      setGeneralError("Please complete the security verification (captcha) before submitting.");
      return;
    }

    // The contract's field JSON: every declared field, with `<id>Other` keys
    // always present ("" when the Other option isn't chosen).
    const payloadFields: FieldValues = { ...values };
    for (const section of config.sections) {
      for (const field of section.fields) {
        if (!field.other) continue;
        // Send the typed value only while "Other" is still selected. Without
        // this, choosing Other, typing, then switching back leaves the stale
        // text in `values` and Avni records both the coded answer and a
        // contradicting "<concept> other".
        payloadFields[`${field.id}Other`] = otherActive(field, values)
          ? values[`${field.id}Other`] ?? ""
          : "";
      }
    }

    setGeneralError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captchaToken, _gotcha: gotcha, fields: payloadFields }),
      });

      if (res.status === 200 || res.status === 202) {
        const body = (await res.json()) as SubmitOk;
        sessionStorage.removeItem(DRAFT_KEY);
        track("form_submitted", { outcome: res.status === 200 ? "created" : "queued", cohort: config.cohort });
        setResult(body);
        return;
      }

      if (res.status === 429) {
        track("submit_failed", { code: "RATE_LIMITED" });
        resetCaptcha();
        setGeneralError("Too many attempts — please try again in a minute.");
        return;
      }

      const body = (await res.json().catch(() => ({}))) as ErrorBody;
      const code = body.code ?? "INTERNAL";
      track("submit_failed", { code });

      if (res.status === 400 && code === "VALIDATION_FAILED") {
        const fieldErrors = body.fieldErrors ?? {};
        setErrors(fieldErrors);
        const first = fields.find((f) => fieldErrors[f.id]);
        if (first) scrollToField(first.id);
        resetCaptcha();
        return;
      }
      if (res.status === 400 && code === "CAPTCHA_FAILED") {
        resetCaptcha();
        setGeneralError("Security verification failed — please tick the captcha and try again.");
        return;
      }
      if (res.status === 403 && code === "REGISTRATION_CLOSED") {
        setClosedAt(body.closesAt ?? config.closesAt);
        return;
      }
      resetCaptcha();
      setGeneralError("Something went wrong on our side. Please try submitting again.");
    } catch {
      track("submit_failed", { code: "NETWORK" });
      resetCaptcha();
      setGeneralError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // REG_CLOSE defaults to "" and windowOpen treats that as open-ended, so an
  // unguarded format renders "Applications close Invalid Date" to every
  // applicant. No date -> drop the clause entirely.
  const closesDate = config?.closesAt ? new Date(config.closesAt) : null;
  const closesFormatted =
    closesDate && !Number.isNaN(closesDate.getTime())
      ? closesDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      : "";

  let content;
  if (loading) {
    content = (
      <Box sx={{ textAlign: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  } else if (configError || !config) {
    content = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      >
        Could not load the application form. Please try again in a moment.
      </Alert>
    );
  } else if (!config.open || closedAt) {
    content = <ClosedScreen closesAt={closedAt ?? config.closesAt} />;
  } else if (result) {
    content = <SuccessScreen reference={result.reference} cohort={config.cohort} />;
  } else {
    content = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        <FormRenderer config={config} values={values} errors={errors} onChange={handleChange} onBlur={handleBlur} />

        {/* Honeypot — hidden from humans; bots that fill it get a fake success. */}
        <input
          type="text"
          name="_gotcha"
          value={gotcha}
          onChange={(e) => setGotcha(e.target.value)}
          style={{ display: "none" }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <Paper
          elevation={0}
          sx={{
            bgcolor: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            p: { xs: 2.5, sm: 4 },
            mb: 3,
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>Security verification *</Typography>
          {SITE_KEY ? (
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={SITE_KEY}
              onChange={(token) => setCaptchaToken(token)}
              onExpired={() => setCaptchaToken(null)}
            />
          ) : (
            <Alert severity="warning">Security verification is not configured; submissions are disabled.</Alert>
          )}
          {generalError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {generalError}
            </Alert>
          )}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={submitting || !SITE_KEY}
            sx={{ mt: 2, borderRadius: "8px", fontWeight: 600, fontSize: 16 }}
          >
            {submitting ? "Submitting…" : "Submit application"}
          </Button>
        </Paper>
      </form>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {banner !== "missing" && (
        <Box
          sx={{
            // Pinned across the full viewport width; the form scrolls under it.
            position: "sticky",
            top: 0,
            zIndex: (t) => t.zIndex.appBar,
            // Matches the banner artwork's own green→blue gradient, so on very
            // wide screens the bar extends the image instead of framing it.
            background: "linear-gradient(90deg, #e9f5ea 0%, #c6e0f7 100%)",
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            // Collapse until the image actually loads, so there's never an
            // empty bar while the request is in flight.
            display: banner === "loaded" ? "block" : "none",
          }}
        >
          <img
            src="/banner.png"
            alt="Avni Launchpad — Cohort banner"
            // Full width up to 880px (a 4:1 banner stays ≤220px tall), centred
            // beyond that so no text is ever cropped.
            style={{ display: "block", width: "100%", maxWidth: 880, height: "auto", margin: "0 auto" }}
            onLoad={() => setBanner("loaded")}
            onError={() => setBanner("missing")}
          />
        </Box>
      )}
      <Box sx={{ py: { xs: 3, sm: 6 }, px: 2 }}>
        {/* 880px matches the banner image width, so the column lines up with it. */}
        <Container disableGutters sx={{ maxWidth: "880px !important" }}>
        <Box sx={{ textAlign: "center", mb: 4 }}>
          {/* The banner carries the Avni logo already; avoid showing it twice. */}
          {banner !== "loaded" && <img src={logo} alt="Avni" style={{ height: 56 }} />}
          <Typography variant="h5" sx={{ mt: 1 }}>
            {config?.title ?? "Apply to Avni Launchpad"}
          </Typography>
          {config && !loading && (
            <Typography sx={{ color: "text.secondary", fontSize: 14, mt: 0.5 }}>
              {config.cohort}
              {config.open && !closedAt && !result && closesFormatted ? ` · Applications close ${closesFormatted}` : ""}
            </Typography>
          )}
        </Box>
        {/* The Google-Forms-style intro, shown only alongside the live form. */}
        {config?.description && config.open && !closedAt && !result && (
          <Paper
            elevation={0}
            sx={{
              bgcolor: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
              p: { xs: 2.5, sm: 4 },
              mb: 3,
            }}
          >
            {config.description.split(/\n\s*\n/).map((paragraph, i) => (
              <Typography
                key={i}
                sx={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  fontWeight: i === 0 ? 600 : 400,
                  mb: 1.5,
                  "&:last-child": { mb: 0 },
                }}
              >
                {linkify(paragraph)}
              </Typography>
            ))}
          </Paper>
        )}
        {content}
        </Container>
      </Box>
    </Box>
  );
}
