import { Router } from "express";
import { buildBusinessSummary, buildBusinessSummaryCsv } from "../../tools/reports/reportBuilder.js";
import { asyncHandler } from "../../middleware/validate.js";

export const reportsRouter = Router();

reportsRouter.get(
  "/reports/summary",
  asyncHandler(async (req, res) => {
    const report = buildBusinessSummary({
      merchant_id: req.merchant!.id,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(report);
  }),
);

reportsRouter.get(
  "/reports/summary.csv",
  asyncHandler(async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const report = buildBusinessSummary({ merchant_id: req.merchant!.id, from, to });
    const csv = buildBusinessSummaryCsv(report);

    const filenameParts = ["fractalpay-summary", from, to].filter(Boolean);
    res.setHeader("content-type", "text/csv");
    res.setHeader("content-disposition", `attachment; filename="${filenameParts.join("-")}.csv"`);
    res.send(csv);
  }),
);
