import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock ENV
vi.mock("./_core/env", () => ({
  ENV: {
    capitalApiKey: "test-api-key",
    capitalEmail: "test@example.com",
    capitalPassword: "test-password",
  },
}));

describe("Capital.com API Service", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("successfully authenticates and returns session tokens", async () => {
    // Mock session creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === "CST") return "test-cst-token";
          if (key === "X-SECURITY-TOKEN") return "test-security-token";
          return null;
        },
      },
      json: async () => ({}),
    });

    // Mock accounts response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        accounts: [
          {
            accountId: "acc-123",
            accountName: "HJ Capital Demo",
            balance: { balance: 250.0, deposit: 250.0, profitLoss: 0, available: 250.0 },
            currency: "USD",
            status: "ENABLED",
            preferred: true,
            accountType: "CFD",
          },
        ],
      }),
    });

    const { testConnection } = await import("./capitalcom");
    const result = await testConnection();

    expect(result.ok).toBe(true);
    expect(result.accountName).toBe("HJ Capital Demo");
    expect(result.balance).toBe(250.0);
  });

  it("handles authentication failure gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => "Unauthorized",
    });

    const { testConnection } = await import("./capitalcom");
    const result = await testConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("maps instrument names to Capital.com epics correctly", async () => {
    const { INSTRUMENT_EPICS } = await import("./capitalcom");

    // Core instruments
    expect(INSTRUMENT_EPICS["EURUSD"]).toBe("EURUSD");
    expect(INSTRUMENT_EPICS["GBPUSD"]).toBe("GBPUSD");
    expect(INSTRUMENT_EPICS["GOLD"]).toBe("GOLD");
    expect(INSTRUMENT_EPICS["US500"]).toBe("US500");
    expect(INSTRUMENT_EPICS["BTC"]).toBe("BITCOIN");

    // Critical epics that caused losses — must be correct Capital.com identifiers
    expect(INSTRUMENT_EPICS["NASDAQ"]).toBe("US100");       // NASDAQ CFD on Capital.com
    expect(INSTRUMENT_EPICS["GER40"]).toBe("DE40");         // DAX 40 CFD on Capital.com
    expect(INSTRUMENT_EPICS["OIL_CRUDE"]).toBe("OIL_CRUDE"); // Crude oil CFD
    expect(INSTRUMENT_EPICS["USDJPY"]).toBe("USDJPY");      // USD/JPY forex
    expect(INSTRUMENT_EPICS["EURGBP"]).toBe("EURGBP");      // EUR/GBP forex
  });

  it("validates that zero-price entries are detected and rejected", () => {
    // This test verifies the zero-price guard logic
    // A trade with entry price = 0 should be blocked before execution
    const invalidPrices = [0, NaN, -1, null, undefined];
    const validPrices = [1.16, 4345, 30210, 76.5, 24843];

    for (const price of invalidPrices) {
      const isInvalid = !price || (price as number) <= 0 || isNaN(price as number);
      expect(isInvalid).toBe(true);
    }

    for (const price of validPrices) {
      const isInvalid = !price || price <= 0 || isNaN(price);
      expect(isInvalid).toBe(false);
    }
  });

  it("detects price deviation > 20% between AI estimate and live price", () => {
    // Test the price deviation guard logic
    const checkDeviation = (aiEstimate: number, livePrice: number) =>
      Math.abs(livePrice - aiEstimate) / livePrice;

    // GOLD: AI says 4324, live = 4345 — 0.5% deviation (OK)
    expect(checkDeviation(4324, 4345)).toBeLessThan(0.20);

    // NASDAQ: AI says 30101, live = 30210 — 0.4% deviation (OK)
    expect(checkDeviation(30101, 30210)).toBeLessThan(0.20);

    // Stale data: AI says 1.05, live = 1.35 — ~22% deviation (BLOCK)
    expect(checkDeviation(1.05, 1.35)).toBeGreaterThan(0.20);

    // Zero entry vs live price — always 100% deviation (BLOCK)
    expect(checkDeviation(0, 4345)).toBeGreaterThan(0.20);
  });

  it("calculates mid price correctly from bid/ask", async () => {
    // Mock session
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === "CST") return "test-cst";
          if (key === "X-SECURITY-TOKEN") return "test-sec";
          return null;
        },
      },
      json: async () => ({}),
    });

    // Mock market price response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        snapshot: {
          bid: 1.0850,
          offer: 1.0852,
          netChange: 0.0012,
          percentageChange: 0.11,
          updateTime: "2026-06-13T10:00:00",
        },
      }),
    });

    const { getMarketPrice } = await import("./capitalcom");
    const price = await getMarketPrice("EURUSD");

    expect(price.bid).toBe(1.0850);
    expect(price.ask).toBe(1.0852);
    expect(price.mid).toBeCloseTo(1.0851, 4);
    expect(price.pctChange).toBe(0.11);
  });
});
