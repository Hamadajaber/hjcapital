export interface CashMovementCandidate {
  reference: string;
  type?: string;
  cashTransaction?: boolean;
  instrumentName?: string;
  size?: number;
  date: string;
}

const EXTERNAL_CASH_TYPES = new Set(["DEPOSIT", "WITHDRAWAL", "TRANSFER", "CASH_ADJUSTMENT"]);

/**
 * Identifies the most recent previously-unapplied external cash movement.
 * Financing and trading P&L are deliberately excluded: neither may reset the risk peak.
 */
export function getUnappliedExternalCashMovement(
  transactions: CashMovementCandidate[],
  lastAppliedReference?: string | null
): CashMovementCandidate | undefined {
  return transactions
    .filter((transaction) => {
      const type = transaction.type?.trim().toUpperCase() ?? "";
      const hasUnlabelledCashShape =
        !transaction.instrumentName &&
        typeof transaction.size === "number" &&
        !["TRADE", "POSITION"].includes(type);
      return Boolean(transaction.reference) &&
        transaction.reference !== lastAppliedReference &&
        (transaction.cashTransaction === true || EXTERNAL_CASH_TYPES.has(type) || hasUnlabelledCashShape);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}
