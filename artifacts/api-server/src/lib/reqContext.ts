import type { NextFunction, Request, Response } from "express";

/** Device-scoped "user" identity — self-asserted by the client via X-Device-ID. */
export function getDeviceId(req: Request): string {
  return (req.headers["x-device-id"] as string) ?? "legacy";
}

/** Blocks a route outside development — used for debug/test-only endpoints. */
export function devOnly(_req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}
