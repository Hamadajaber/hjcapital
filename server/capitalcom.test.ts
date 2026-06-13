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

    expect(INSTRUMENT_EPICS["EURUSD"]).toBe("EURUSD");
    expect(INSTRUMENT_EPICS["GBPUSD"]).toBe("GBPUSD");
    expect(INSTRUMENT_EPICS["GOLD"]).toBe("GOLD");
    expect(INSTRUMENT_EPICS["US500"]).toBe("US500");
    expect(INSTRUMENT_EPICS["BTC"]).toBe("BITCOIN");
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
