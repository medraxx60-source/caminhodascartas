import { describe, it, expect } from "vitest";
import { freeReason, isActiveClaim, FREE_IP_LIMIT, FREE_IP_WINDOW_MS } from "@/lib/free-eligibility";

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

describe("limite por rede: 5 em 24 horas", () => {
  const net = (n: number) => freeReason({ enabled: true, deviceConsumed: 0, networkActive: n, ipLimit: FREE_IP_LIMIT });
  it("limite é 5 e janela é 24h", () => { expect(FREE_IP_LIMIT).toBe(5); expect(FREE_IP_WINDOW_MS).toBe(86400000); });
  it("4 leituras na rede ainda libera", () => expect(net(4)).toBe("eligible"));
  it("5 leituras na rede bloqueia temporariamente", () => expect(net(5)).toBe("network_limit"));
  it("consumida há 23h conta", () => expect(isActiveClaim({ status: "consumed", expires_at: "2026-11-10T23:10:00Z", created_at: "2026-11-10T23:00:00Z" }, now)).toBe(true));
  it("consumida há 25h não conta para a rede", () => expect(isActiveClaim({ status: "consumed", expires_at: "2026-11-10T21:10:00Z", created_at: "2026-11-10T21:00:00Z" }, now)).toBe(false));
  it("aparelho que já usou continua bloqueado mesmo após 24h", () => expect(freeReason({ enabled: true, deviceConsumed: 1, networkActive: 0, ipLimit: FREE_IP_LIMIT })).toBe("device_already_used"));
});
