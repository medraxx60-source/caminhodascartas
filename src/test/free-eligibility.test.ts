import { describe, it, expect } from "vitest";
import { freeReason, isActiveClaim } from "@/lib/free-eligibility";

const now = Date.parse("2026-11-11T22:00:00Z");
describe("gratuidade", () => {
  it("visitante novo é elegível", () => expect(freeReason({ enabled: true, deviceConsumed: 0, networkActive: 0, ipLimit: 3 })).toBe("eligible"));
  it("aparelho que já consumiu", () => expect(freeReason({ enabled: true, deviceConsumed: 1, networkActive: 0, ipLimit: 3 })).toBe("device_already_used"));
  it("visitante novo com rede no limite de 3", () => expect(freeReason({ enabled: true, deviceConsumed: 0, networkActive: 3, ipLimit: 3 })).toBe("network_limit"));
  it("gratuidade desativada", () => expect(freeReason({ enabled: false, deviceConsumed: 0, networkActive: 0, ipLimit: 3 })).toBe("disabled"));
  it("reserva expirada não conta", () => expect(isActiveClaim({ status: "reserved", expires_at: "2026-11-11T21:59:00Z" }, now)).toBe(false));
  it("reserva válida conta", () => expect(isActiveClaim({ status: "reserved", expires_at: "2026-11-11T22:05:00Z" }, now)).toBe(true));
  it("leitura consumida continua contando", () => expect(isActiveClaim({ status: "consumed", expires_at: "2026-10-01T00:00:00Z" }, now)).toBe(true));
  it("reserva liberada não conta", () => expect(isActiveClaim({ status: "released", expires_at: "2026-11-11T22:05:00Z" }, now)).toBe(false));
});
