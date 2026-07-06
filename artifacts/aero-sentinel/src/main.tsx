// Record app start time IMMEDIATELY — before React mounts
// This is used by useAlertNotifications to suppress notifications
// during the initial load period (first 90 seconds)
(window as any).__APP_START_TIME = Date.now();

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { getDeviceId } from "@/lib/deviceId";

// Production'da API isteklerini Railway'e yönlendir
if (import.meta.env.PROD) {
  // Determine API base URL based on hostname.
  // Must stay in sync with the backend's production CORS allowlist (app.ts) —
  // aerosentinel.pages.dev and production.aerosentinel.pages.dev are treated
  // as production there, so they must resolve to the production API here too.
  const hostname = window.location.hostname;
  const isProduction = hostname === 'aerosentinel.app' ||
                       hostname === 'www.aerosentinel.app' ||
                       hostname === 'aerosentinel.pages.dev' ||
                       hostname === 'production.aerosentinel.pages.dev';
  const API_BASE = isProduction
    ? "https://workspaceapi-server-production-b312.up.railway.app"
    : "https://api-server-preview-preview.up.railway.app";
  setBaseUrl(API_BASE);

  const deviceId = getDeviceId();

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
