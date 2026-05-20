import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem("aero-sentinel-theme") ?? "dark";
document.documentElement.classList.add(savedTheme);

createRoot(document.getElementById("root")!).render(<App />);
