import posthog from "posthog-js";

// Same PostHog project as avni-webapp (src/providers.tsx there); the key is
// public by design. Three funnel events only — no identify, no session
// recording: there is personal data on screen.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

export function initAnalytics(): void {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: "https://eu.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_heatmaps: false,
    disable_session_recording: true,
  });
}

export function track(event: "form_viewed" | "form_submitted" | "submit_failed", props: Record<string, string>): void {
  if (!KEY) return;
  posthog.capture(event, props);
}
