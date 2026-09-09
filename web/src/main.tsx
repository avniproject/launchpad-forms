import React from "react";
import ReactDOM from "react-dom/client";
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
