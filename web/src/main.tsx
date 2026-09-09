import React from "react";
import ReactDOM from "react-dom/client";
// react-google-recaptcha picks its script URL from this global, so it must be
// set before the widget mounts: enterprise.js instead of api.js. Both are
// served from www.google.com, which the CSP already allows.
if ((import.meta.env.VITE_RECAPTCHA_ENTERPRISE as string) === "1") {
  (window as unknown as { recaptchaOptions?: Record<string, unknown> }).recaptchaOptions = {
    enterprise: true,
  };
}

import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact from "@bugsnag/plugin-react";
import BugsnagPerformance from "@bugsnag/browser-performance";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { theme } from "@/theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initAnalytics } from "@/analytics";
import App from "./App";

const bugsnagKey = import.meta.env.VITE_BUGSNAG_KEY as string | undefined;
// MODE is "production" for any vite build, UAT included.
const releaseStage = (import.meta.env.VITE_RELEASE_STAGE as string) || import.meta.env.MODE;
if (bugsnagKey) {
  Bugsnag.start({
    apiKey: bugsnagKey,
    plugins: [new BugsnagPluginReact()],
    releaseStage,
  });
  // Page-load timing and Core Web Vitals for the signup page. Installed from
  // npm rather than Bugsnag's suggested <script> tag from cloudfront — the
  // CSP allows scripts only from self, google and gstatic, so the CDN form
  // would be blocked with no visible error.
  BugsnagPerformance.start({ apiKey: bugsnagKey, releaseStage });
}

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
