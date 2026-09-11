import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { message: "Validation failed", issues: err.issues } });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { message: err.message } });
  }

  logger.error("Unhandled error", { err: err instanceof Error ? err.stack : err });
  return res.status(500).json({ error: { message: "Internal server error" } });
}
