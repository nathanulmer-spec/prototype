import { Router } from "express";
import { returnsRepo } from "../../db/repositories/returns.repo.js";
import { asyncHandler } from "../../middleware/validate.js";

export const returnsRouter = Router();

returnsRouter.get(
  "/returns",
  asyncHandler(async (req, res) => {
    const returns = returnsRepo.list(req.merchant!.id, {
      transaction_id: req.query.transaction_id as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: returns });
  }),
);
