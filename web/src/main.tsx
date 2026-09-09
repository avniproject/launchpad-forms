import React from "react";
import ReactDOM from "react-dom/client";
import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact from "@bugsnag/plugin-react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { theme } from "@/theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initAnalytics } from "@/analytics";
import App from "./App";

const bugsnagKey = import.meta.env.VITE_BUGSNAG_KEY as string | undefined;
if (bugsnagKey) {
  Bugsnag.start({
    apiKey: bugsnagKey,
    plugins: [new BugsnagPluginReact()],
    releaseStage: import.meta.env.MODE,
  });
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
