const STORAGE_KEY = "aero-device-id";

/** Get or create a persistent per-browser device ID, used as the anonymous user identity. */
export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "legacy";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
