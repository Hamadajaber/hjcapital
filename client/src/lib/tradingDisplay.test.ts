import { describe, expect, it } from "vitest";
import { resolveDisplayTradingMode } from "./tradingDisplay";

describe("resolveDisplayTradingMode", () => {
  it("prioritizes a running live engine over a stale paper portfolio value", () => {
    expect(resolveDisplayTradingMode("paper", { isRunning: true, mode: "live" })).toBe("live");
  });

  it("uses a running paper engine when one is explicitly active", () => {
    expect(resolveDisplayTradingMode("live", { isRunning: true, mode: "paper" })).toBe("paper");
  });

  it("falls back to the persisted portfolio mode while the engine is inactive", () => {
    expect(resolveDisplayTradingMode("live", { isRunning: false, mode: null })).toBe("live");
  });
});

