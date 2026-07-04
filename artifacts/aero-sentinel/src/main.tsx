// Record app start time IMMEDIATELY — before React mounts
// This is used by useAlertNotifications to suppress notifications
// during the initial load period (first 90 seconds)
(window as any).__APP_START_TIME = Date.now();

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// Generate or retrieve a persistent device ID for this browser
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("aero-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("aero-device-id", id);
  }
  return id;
}

// Production'da API isteklerini Railway'e yönlendir
if (import.meta.env.PROD) {
  // Determine API base URL based on hostname
  const isProduction = window.location.hostname === 'aerosentinel.app' ||
                       window.location.hostname === 'www.aerosentinel.app';
  const API_BASE = isProduction
    ? "https://workspaceapi-server-production-b312.up.railway.app"
    : "https://api-server-preview-preview.up.railway.app";
  setBaseUrl(API_BASE);

  const deviceId = getOrCreateDeviceId();

  // Doğrudan fetch() çağrılarını da yönlendir (Dashboard.tsx, Airports.tsx vb.)
  const origFetch = window.fetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("/api/")) {
      url = API_BASE + url;
      if (typeof input === "string") input = url;
      else if (input instanceof URL) input = new URL(url);
      else input = new Request(url, input as Request);
    }
    // Inject X-Device-ID header into every API request
    const mergedHeaders = new Headers(init?.headers);
    mergedHeaders.set("X-Device-ID", deviceId);
    return origFetch(input, init ? { ...init, headers: mergedHeaders } : { headers: mergedHeaders });
  };
}

createRoot(document.getElementById("root")!).render(<App />);
