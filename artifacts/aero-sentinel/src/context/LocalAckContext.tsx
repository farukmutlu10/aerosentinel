import { createContext, useContext } from "react";

// Per-device optimistic "seen/acked" id list — instant UI feedback while the
// real PATCH /alerts/:id/acknowledge round-trips. Split into its own module
// (rather than living in App.tsx) so hooks like useAckAlert can depend on it
// without an App.tsx <-> hook circular import.
export interface LocalAckCtx {
  localAcked: number[];
  setLocalAcked: (val: number[] | ((prev: number[]) => number[])) => void;
}

export const LocalAckContext = createContext<LocalAckCtx>({ localAcked: [], setLocalAcked: () => {} });
export const useLocalAck = () => useContext(LocalAckContext);
