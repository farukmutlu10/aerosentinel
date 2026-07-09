import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

// Shared drag/peek behavior for the floating Teams+Chat button group: the
// whole group is locked to whichever screen edge it's docked to (dragging
// across the midpoint flips it, it never floats free), and can be "peeked" —
// slid mostly off-screen with a small sliver left clickable — to get it out
// of the way without losing its position.
export const BUTTON_SIZE = 60;
export const EDGE_MARGIN = 10;
export const PEEK_VISIBLE = 16;
export type Edge = "left" | "right";

function clampY(y: number, height: number) {
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  return Math.min(Math.max(EDGE_MARGIN, y), maxY);
}

function xForEdge(edge: Edge, width: number) {
  return edge === "left" ? EDGE_MARGIN : window.innerWidth - width - EDGE_MARGIN;
}

/**
 * `size.width`/`size.height` describe the whole draggable unit — for the
 * merged Teams+Chat group that's BUTTON_SIZE wide and 2*BUTTON_SIZE tall (the
 * two circles stacked with no gap), so drag clamping and the docked edge
 * position account for the full unit, not just one circle.
 *
 * `onOpen` receives an optional `role` — the `data-role` attribute of the
 * sub-element under the pointer at press time (closest ancestor with one).
 * This lets a press-without-drag on the merged group route to the right
 * sub-button's open handler (e.g. "team" vs "chat") while the whole group
 * still drags/peeks as a single unit.
 */
export function useDraggableEdgeButton(
  storageKeyPrefix: string,
  defaultY: number,
  onOpen: (role?: string) => void,
  size: { width?: number; height?: number } = {},
) {
  const width = size.width ?? BUTTON_SIZE;
  const height = size.height ?? BUTTON_SIZE;
  const posKey = `${storageKeyPrefix}-pos`;
  const edgeKey = `${storageKeyPrefix}-edge`;
  const peekKey = `${storageKeyPrefix}-peeked`;

  const loadEdge = useCallback((): Edge => {
    try { return localStorage.getItem(edgeKey) === "left" ? "left" : "right"; } catch { return "right"; }
  }, [edgeKey]);
  const loadY = useCallback((): number => {
    try {
      const raw = localStorage.getItem(posKey);
      if (raw) { const y = Number(raw); if (Number.isFinite(y)) return clampY(y, height); }
    } catch { /* ignore */ }
    return clampY(defaultY, height);
  }, [posKey, defaultY, height]);
  const loadPeeked = useCallback((): boolean => {
    try { return localStorage.getItem(peekKey) === "1"; } catch { return false; }
  }, [peekKey]);

  const [edge, setEdge] = useState<Edge>(loadEdge);
  const [y, setY] = useState<number>(loadY);
  const [peeked, setPeeked] = useState<boolean>(loadPeeked);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const dragEdgeRef = useRef<Edge>(edge);
  const startRef = useRef({ x: 0, y: 0, startY: 0 });
  const pressedRoleRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const onResize = () => setY((prev) => clampY(prev, height));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [height]);

  const saveEdge = useCallback((e: Edge) => { try { localStorage.setItem(edgeKey, e); } catch { /* ignore */ } }, [edgeKey]);
  const saveY = useCallback((v: number) => { try { localStorage.setItem(posKey, String(v)); } catch { /* ignore */ } }, [posKey]);
  const savePeeked = useCallback((v: boolean) => { try { localStorage.setItem(peekKey, v ? "1" : "0"); } catch { /* ignore */ } }, [peekKey]);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (peeked) return;
    draggingRef.current = true;
    movedRef.current = false;
    dragEdgeRef.current = edge;
    startRef.current = { x: e.clientX, y: e.clientY, startY: y };
    pressedRoleRef.current = (e.target as HTMLElement).closest<HTMLElement>("[data-role]")?.dataset.role;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [edge, y, peeked]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    if (!movedRef.current) return;
    dragEdgeRef.current = e.clientX < window.innerWidth / 2 ? "left" : "right";
    setY(clampY(startRef.current.startY + dy, height));
  }, [height]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (movedRef.current) {
      setEdge(dragEdgeRef.current);
      saveEdge(dragEdgeRef.current);
      setY((prev) => { saveY(prev); return prev; });
    } else {
      onOpen(pressedRoleRef.current);
    }
  }, [onOpen, saveEdge, saveY]);

  const togglePeek = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPeeked((prev) => { const next = !prev; savePeeked(next); return next; });
  }, [savePeeked]);

  const unpeek = useCallback(() => {
    setPeeked(false);
    savePeeked(false);
  }, [savePeeked]);

  const dockedX = xForEdge(edge, width);
  const left = peeked
    ? (edge === "right" ? window.innerWidth - PEEK_VISIBLE : -(width - PEEK_VISIBLE))
    : dockedX;

  return { edge, y, peeked, left, handlePointerDown, handlePointerMove, handlePointerUp, togglePeek, unpeek };
}
