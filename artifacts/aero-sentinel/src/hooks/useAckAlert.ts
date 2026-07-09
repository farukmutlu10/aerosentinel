import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcknowledgeAlert, getListAlertsQueryKey, customFetch } from "@workspace/api-client-react";
import { useLocalAck, type LocalAckCtx } from "@/context/LocalAckContext";

/**
 * Acknowledging an alert is shared state (the `acknowledged` column has no
 * per-device owner — see monitor.ts), so it must reach the server, not just
 * this device's local "seen" list. `localAcked` still drives instant
 * optimistic UI (no round-trip flicker), but the actual write-through to
 * `PATCH /alerts/:id/acknowledge` / `/alerts/acknowledge-all` is what makes
 * other devices watching the same alert (personal or, notably, teammates in
 * Teams mode) see it as acknowledged too.
 *
 * Accepts an optional `setLocalAcked` for call sites that already hold the
 * raw state (App.tsx owns it and renders LocalAckContext.Provider itself, so
 * it can't consume its own context) — everyone else can omit it and this
 * falls back to reading it via useLocalAck().
 */
export function useAckAlert(setLocalAckedOverride?: LocalAckCtx["setLocalAcked"]) {
  const { setLocalAcked: setLocalAckedFromContext } = useLocalAck();
  const setLocalAcked = setLocalAckedOverride ?? setLocalAckedFromContext;
  const queryClient = useQueryClient();
  const ackMutation = useAcknowledgeAlert();

  const ackOne = useCallback((id: number) => {
    setLocalAcked((prev) => (prev.includes(id) ? prev : [...prev, id]));
    // Negative ids are synthetic, live-detected-but-not-yet-persisted alerts
    // (see stableSyntheticId() in routes/watchlist.ts) — nothing to PATCH.
    if (id <= 0) return;
    void ackMutation.mutateAsync({ id })
      .then(() => { queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() }); })
      .catch(() => { /* local state already reflects the intent */ });
  }, [setLocalAcked, ackMutation, queryClient]);

  const ackMany = useCallback(async (ids: number[]) => {
    setLocalAcked((prev) => [...new Set([...prev, ...ids])]);
    try {
      await customFetch("/api/alerts/acknowledge-all", { method: "PATCH" });
    } catch { /* local state already reflects the intent */ }
    queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
  }, [setLocalAcked, queryClient]);

  return { ackOne, ackMany };
}
