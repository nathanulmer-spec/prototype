import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { getDb } from "./db/client.js";
import { v1Router } from "./api/v1/router.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { startDispatcher } from "./webhooks/dispatcher.js";
import { startWebhookWorker } from "./webhooks/worker.js";
import { startReconciliationService } from "./tools/reconciliation/reconciliationService.js";
import { logger } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

getDb();
startDispatcher();
startReconciliationService();
startWebhookWorker();

const app = express();
app.use(express.json());
app.use(requestLogger);
app.use("/api/v1", v1Router);
app.use(express.static(join(__dirname, "..", "public")));
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Fractal Pay merchant API listening on port ${config.port}`);
  logger.info(`Dashboard available at http://localhost:${config.port}/`);
});
