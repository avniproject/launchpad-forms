// reCAPTCHA Enterprise, score-based flow.
//
// A score key has no widget: the page calls grecaptcha.enterprise.execute()
// when the applicant submits, and the service scores the resulting token.
// react-google-recaptcha cannot do this — its invisible mode calls the v2
// grecaptcha.execute(widgetId), not enterprise.execute(siteKey, {action}) —
// so the script is loaded and called directly here.
//
// The action is part of the contract: the service asserts that the action in
// the assessment matches what it expects, which stops a token minted on some
// other page being replayed against this endpoint.

const SCRIPT_ID = "recaptcha-enterprise";

interface GrecaptchaEnterprise {
  enterprise: {
    ready(cb: () => void): void;
    execute(siteKey: string, opts: { action: string }): Promise<string>;
  };
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaEnterprise;
  }
}

let loading: Promise<void> | null = null;

function loadScript(siteKey: string): Promise<void> {
  if (window.grecaptcha?.enterprise) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("recaptcha script failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    // ?render=<siteKey> is what makes execute() available for a score key.
    s.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("recaptcha script failed to load"));
    document.head.appendChild(s);
  });
  return loading;
}

/** Load reCAPTCHA early so the first submit is not waiting on a script fetch. */
export function preloadCaptcha(siteKey: string): void {
  if (!siteKey) return;
  void loadScript(siteKey).catch(() => undefined);
}

/**
 * Mint a token for `action`. Throws if the script cannot load or execute —
 * the caller surfaces that rather than submitting a request the service is
 * certain to reject.
 */
export async function executeCaptcha(siteKey: string, action: string): Promise<string> {
  await loadScript(siteKey);
  const g = window.grecaptcha;
  if (!g?.enterprise) throw new Error("recaptcha unavailable");
  await new Promise<void>((resolve) => g.enterprise.ready(resolve));
  return g.enterprise.execute(siteKey, { action });
}
