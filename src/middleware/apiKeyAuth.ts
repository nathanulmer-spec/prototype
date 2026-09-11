import type { NextFunction, Request, Response } from "express";
import { merchantsRepo } from "../db/repositories/merchants.repo.js";

/**
 * Prototype auth stand-in for a real scheme (OAuth2/JWT). A merchant sends
 * `Authorization: Bearer <api_key>` and every route is scoped to req.merchant.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: { message: "Missing or malformed Authorization header" } });
  }

  const merchant = merchantsRepo.findByApiKey(token);
  if (!merchant) {
    return res.status(401).json({ error: { message: "Invalid API key" } });
  }
  if (merchant.status !== "active") {
    return res.status(403).json({ error: { message: "Merchant account is suspended" } });
  }

  req.merchant = merchant;
  next();
}
