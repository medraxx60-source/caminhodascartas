import { describe, expect, it } from "vitest";
import { CARDS } from "@/lib/lenormand";
import { dailyDateKey, dailySelection, DAILY_MESSAGES, nextUnseenSlot } from "@/lib/daily-message";

describe("seleção editorial diária independente", () => {
  it("mantém a mesma seleção em atualizações do mesmo dia", () => {
    expect(dailySelection("2026-11-18")).toEqual(dailySelection("2026-11-18"));
    expect(dailySelection("2026-11-18")).not.toEqual(dailySelection("2026-11-19"));
  });
  it("seleciona exatamente três índices distintos entre 0 e 35", () => {
    for (let day = 1; day <= 28; day++) {
      const cards = dailySelection(`2026-11-${String(day).padStart(2, "0")}`);
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
      expect(cards.every((index) => Number.isInteger(index) && index >= 0 && index <= 35)).toBe(true);
    }
  });
  it("troca a data somente à meia-noite de Araguaína, independentemente do fuso do aparelho", () => {
    expect(dailyDateKey(new Date("2026-11-18T02:59:59Z"))).toBe("2026-11-17");
    expect(dailyDateKey(new Date("2026-11-18T03:00:00Z"))).toBe("2026-11-18");
    expect(dailySelection(dailyDateKey(new Date("2026-11-18T10:00:00+09:00"))))
      .toEqual(dailySelection(dailyDateKey(new Date("2026-11-17T22:00:00-03:00"))));
  });
  it("possui conteúdo local para as 36 cartas", () => {
    expect(DAILY_MESSAGES).toHaveLength(CARDS.length);
    expect(DAILY_MESSAGES.every((message) => message.trim().length > 0)).toBe(true);
  });
  it("avança 1 → 2 → 3 e encontra cartas não vistas a partir de qualquer escolha", () => {
    expect(nextUnseenSlot(0, [0])).toBe(1);
    expect(nextUnseenSlot(1, [0, 1])).toBe(2);
    expect(nextUnseenSlot(2, [2])).toBe(0);
    expect(nextUnseenSlot(2, [0, 1, 2])).toBeNull();
  });
});