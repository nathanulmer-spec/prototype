import { Router } from "express";
import { apiKeyAuth } from "../../middleware/apiKeyAuth.js";
import { healthRouter } from "./health.routes.js";
import { meRouter } from "./me.routes.js";
import { ordersRouter } from "./orders.routes.js";
import { transactionsRouter } from "./transactions.routes.js";
import { invoicesRouter } from "./invoices.routes.js";
import { fundingRouter } from "./funding.routes.js";
import { reconciliationRouter } from "./reconciliation.routes.js";
import { webhooksRouter } from "./webhooks.routes.js";
import { demoRouter } from "./demo.routes.js";

export const v1Router = Router();

v1Router.use(healthRouter);

v1Router.use(apiKeyAuth);
v1Router.use(meRouter);
v1Router.use(ordersRouter);
v1Router.use(transactionsRouter);
v1Router.use(invoicesRouter);
v1Router.use(fundingRouter);
v1Router.use(reconciliationRouter);
v1Router.use(webhooksRouter);
v1Router.use(demoRouter);
