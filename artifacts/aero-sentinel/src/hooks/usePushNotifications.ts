import { useState, useEffect, useCallback } from "react";
import { getDeviceId } from "@/lib/deviceId";

// ── URL-safe Base64 → Uint8Array conversion for applicationServerKey ─────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // ── Check support and current state on mount ──────────────────────────────
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setPermission("unsupported");
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission as PushPermissionState);

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  // ── Subscribe to push notifications ───────────────────────────────────────
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
      if (perm !== "granted") {
        console.log("[Push] Permission denied by user");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Fetch VAPID public key from backend
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) {
        console.error("[Push] Failed to fetch VAPID key:", keyRes.status);
        return false;
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        console.error("[Push] No VAPID public key returned");
        return false;
      }

      // Subscribe to push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
      });

      // Send subscription to backend
      const subJson = subscription.toJSON();
      const deviceId = getDeviceId();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (!res.ok) {
        console.error("[Push] Failed to save subscription:", res.status);
        return false;
      }

      setIsSubscribed(true);
      console.log("[Push] ✅ Subscribed successfully");
      return true;
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
      return false;
    }
  }, [isSupported]);

  // ── Unsubscribe from push notifications ───────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Notify backend
      const deviceId = getDeviceId();
      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": deviceId,
        },
        body: JSON.stringify({ endpoint }),
      });

      setIsSubscribed(false);
      console.log("[Push] ✅ Unsubscribed successfully");
      return true;
    } catch (err) {
      console.error("[Push] Unsubscribe error:", err);
      return false;
    }
  }, []);

  return { permission, isSubscribed, isSupported, subscribe, unsubscribe };
}
