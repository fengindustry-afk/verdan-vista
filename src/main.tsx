import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, getStoredTheme } from "./lib/theme";

// Apply the saved theme before first paint to avoid a flash of the default.
const { setId, mode } = getStoredTheme();
applyTheme(setId, mode);

createRoot(document.getElementById("root")!).render(<App />);
