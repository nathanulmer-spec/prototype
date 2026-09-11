import { eventBus } from "../../webhooks/eventBus.js";
import { invoicesRepo } from "../../db/repositories/invoices.repo.js";
import { transactionsRepo } from "../../db/repositories/transactions.repo.js";
import { amountsMatch } from "./matcher.js";
import { logger } from "../../utils/logger.js";
import type { WebhookEventEnvelope } from "../../domain/webhook.js";
import type { Invoice } from "../../domain/invoice.js";
import type { Transaction } from "../../domain/transaction.js";

/**
 * Finds the invoice a successful payment should settle. Prefers an explicit
 * link on the transaction; otherwise falls back to the order's open invoice
 * if the amount lines up with what's still owed.
 */
function findMatchingInvoice(merchantId: string, transaction: Transaction): Invoice | undefined {
  if (transaction.invoice_id) {
    return invoicesRepo.findById(merchantId, transaction.invoice_id);
  }

  if (!transaction.order_id) return undefined;

  const candidate = invoicesRepo.findOpenByOrderId(merchantId, transaction.order_id);
  if (!candidate) return undefined;

  return amountsMatch(candidate, transaction.amount_cents) ? candidate : undefined;
}

/**
 * Auto-reconciles invoices against incoming payments so merchants don't have
 * to manually cross-reference transactions against open invoices.
 */
export function startReconciliationService() {
  eventBus.on("payment.succeeded", (envelope: WebhookEventEnvelope<Transaction>) => {
    const transaction = envelope.data;
    const invoice = findMatchingInvoice(envelope.merchant_id, transaction);

    if (!invoice) {
      logger.info("No invoice match for succeeded payment; left for manual reconciliation", {
        transaction: transaction.id,
      });
      return;
    }

    if (!transaction.invoice_id) {
      transactionsRepo.linkInvoice(envelope.merchant_id, transaction.id, invoice.id);
    }

    const updated = invoicesRepo.applyPayment(
      envelope.merchant_id,
      invoice.id,
      transaction.amount_cents,
      transaction.id,
    );

    if (updated?.status === "reconciled") {
      eventBus.emitEvent("invoice.reconciled", envelope.merchant_id, updated);
      logger.info("Invoice auto-reconciled", { invoice: updated.id, transaction: transaction.id });
    }
  });
}
