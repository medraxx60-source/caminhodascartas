import { describe, expect, it } from "vitest";
import { countPaidSinceReset } from "../lib/paid-counter";

describe("paid counter reset", () => {
  it("zeros historical paid readings without modifying their records", () => {
    const orders = [{ is_free: false, status: "done", created_at: "2026-11-23T05:54:41Z", price_cents: 490 }];
    expect(countPaidSinceReset(orders)).toBe(0);
    expect(orders).toEqual([{ is_free: false, status: "done", created_at: "2026-11-23T05:54:41Z", price_cents: 490 }]);
  });
  it("counts subsequent paid readings but not free or pending readings", () => {
    expect(countPaidSinceReset([
      { is_free: false, status: "done", created_at: "2026-11-23T06:06:00Z" },
      { is_free: false, status: "generating", created_at: "2026-11-23T06:07:00Z" },
      { is_free: true, status: "done", created_at: "2026-11-23T06:07:00Z" },
      { is_free: false, status: "pending", created_at: "2026-11-23T06:07:00Z" },
    ])).toBe(2);
  });
});