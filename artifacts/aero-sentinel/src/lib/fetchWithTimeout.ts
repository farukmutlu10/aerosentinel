// A backgrounded browser tab can leave an in-flight fetch's underlying
// connection stalled indefinitely — it never resolves, never rejects, no
// error, nothing. For a REPEATING poll (setInterval/refetchInterval), one
// hung request permanently blocks every future tick that shares its promise
// (React Query dedupes by query key; plain fetch()-based polling loops just
// never get a callback to schedule the next tick from). Only a full page
// reload — which discards the JS context and the zombie promise with it —
// unsticks it. This wraps fetch() with a hard timeout so a stalled request
// fails fast and whatever polling loop called it can retry on schedule
// instead of hanging forever.
const DEFAULT_TIMEOUT_MS = 20_000;

export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(typeof DOMException !== "undefined" ? new DOMException("Request timed out", "TimeoutError") : new Error("Request timed out"));
  }, timeoutMs);

  const existingSignal = init.signal;
  if (existingSignal) {
    if (existingSignal.aborted) controller.abort(existingSignal.reason);
    else existingSignal.addEventListener("abort", () => controller.abort(existingSignal.reason), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
