import { Router } from "express";
import { fundingBatchesRepo } from "../../db/repositories/fundingBatches.repo.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { returnsRepo } from "../../db/repositories/returns.repo.js";
import { asyncHandler } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const fundingRouter = Router();

fundingRouter.get(
  "/funding/batches",
  asyncHandler(async (req, res) => {
    const batches = fundingBatchesRepo.list(
      req.merchant!.id,
      req.query.limit ? Number(req.query.limit) : undefined,
      req.query.offset ? Number(req.query.offset) : undefined,
    );
    res.json({ data: batches });
  }),
);

fundingRouter.get(
  "/funding/batches/:id",
  asyncHandler(async (req, res) => {
    const batch = fundingBatchesRepo.findById(req.merchant!.id, req.params.id);
    if (!batch) throw new ApiError(404, "Funding batch not found");
    res.json(batch);
  }),
);

// Succeeded transactions not yet swept into a funding batch — lets a
// merchant see money that's already been collected before the next nightly
// batch runs, rather than waiting on the batch step to see it counted.
fundingRouter.get(
  "/funding/pending",
  asyncHandler(async (req, res) => {
    const unbatched = transactionsRepo.listSucceededUnbatched(req.merchant!.id);
    const card_cents = unbatched
      .filter((t) => t.payment_method === "card")
      .reduce((sum, t) => sum + t.amount_cents, 0);
    const ach_cents = unbatched
      .filter((t) => t.payment_method === "ach")
      .reduce((sum, t) => sum + t.amount_cents, 0);
    res.json({ card_cents, ach_cents, count: unbatched.length });
  }),
);

fundingRouter.get(
  "/funding/report",
  asyncHandler(async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = fundingBatchesRepo.report(req.merchant!.id, from, to);
    const returns = returnsRepo.report(req.merchant!.id, from, to);
    res.json({ ...report, ...returns });
  }),
);
