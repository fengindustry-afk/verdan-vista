import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { initSentry } from "./lib/sentry";
import { registerServiceWorker } from "./lib/registerSW";

// Initialize Sentry for error tracking before anything else
initSentry();

// Register the minimal share-target service worker (receive shared files).
registerServiceWorker();

// Apply the saved theme before first paint to avoid a flash of the default.
const { setId, mode } = getStoredTheme();
applyTheme(setId, mode);

createRoot(document.getElementById("root")!).render(<App />);
