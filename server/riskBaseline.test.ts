import { describe, expect, it } from "vitest";
import { getUnappliedExternalCashMovement } from "./riskBaseline";

describe("getUnappliedExternalCashMovement", () => {
  const transactions = [
    { reference: "trade-1", type: "TRADE", cashTransaction: false, date: "2026-09-14T09:00:00Z" },
    { reference: "funding-1", type: "WITHDRAWAL", cashTransaction: true, date: "2026-09-14T10:00:00Z" },
  ];

  it("selects an unapplied withdrawal but never a trade P&L entry", () => {
    expect(getUnappliedExternalCashMovement(transactions)?.reference).toBe("funding-1");
  });

  it("does not apply the same cash movement more than once", () => {
    expect(getUnappliedExternalCashMovement(transactions, "funding-1")).toBeUndefined();
  });

  it("recognizes a broker cash transaction even when its type is unavailable", () => {
    expect(getUnappliedExternalCashMovement([
      { reference: "cash-2", cashTransaction: true, date: "2026-09-14T12:00:00Z" },
    ])?.reference).toBe("cash-2");
  });

  it("recognizes Capital.com's sparse cash movement shape without mistaking a trade for cash", () => {
    const movement = getUnappliedExternalCashMovement([
      { reference: "withdrawal-1", size: -300, date: "2026-09-14T12:00:00Z" },
      { reference: "trade-2", type: "TRADE", size: -300, date: "2026-09-14T11:00:00Z" },
    ]);
    expect(movement?.reference).toBe("withdrawal-1");
  });
});
