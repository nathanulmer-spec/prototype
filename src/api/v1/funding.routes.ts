import { Router } from "express";
import { fundingBatchesRepo } from "../../db/repositories/fundingBatches.repo.js";
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

fundingRouter.get(
  "/funding/report",
  asyncHandler(async (req, res) => {
    const report = fundingBatchesRepo.report(
      req.merchant!.id,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    );
    res.json(report);
  }),
);
