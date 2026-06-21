import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// Production'da API isteklerini api.aerosentinel.app'e yönlendir
if (import.meta.env.PROD) {
  setBaseUrl("https://api.aerosentinel.app");
}

createRoot(document.getElementById("root")!).render(<App />);
