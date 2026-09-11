import { Router } from "express";

export const meRouter = Router();

meRouter.get("/me", (req, res) => {
  const { api_key: _api_key, ...merchant } = req.merchant!;
  res.json(merchant);
});
