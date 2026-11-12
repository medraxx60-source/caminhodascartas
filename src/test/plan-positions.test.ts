import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/lenormand";

describe("planos e posições aprovadas pelo motor de interpretação", () => {
  it("mantém as posições na mesma ordem descrita pelo motor", () => {
    expect(PLANS.essencial.positions).toEqual(["Situação atual", "Desafio", "Tendência"]);
    expect(PLANS.profunda.positions).toEqual([
      "Passado/Raiz", "Situação atual", "Desafio", "Tendência", "Conselho",
    ]);
    expect(PLANS.completa.positions).toEqual([
      "Passado/Raiz", "Momento presente", "O que está oculto",
      "Desafio", "Tendência", "Conselho", "Desfecho",
    ]);
  });

  it("preserva preços e quantidades de cartas das consultas pagas", () => {
    expect([PLANS.essencial.count, PLANS.profunda.count, PLANS.completa.count]).toEqual([3, 5, 7]);
    expect([PLANS.essencial.priceCents, PLANS.profunda.priceCents, PLANS.completa.priceCents]).toEqual([490, 890, 1490]);
    for (const plan of Object.values(PLANS)) {
      expect(plan.positions).toHaveLength(plan.count);
    }
  });
});
