import { describe, expect, it } from "vitest";
import { getPostFreeUpgradeOffers } from "@/lib/post-free-upgrades";
import { PLANS } from "@/lib/lenormand";

describe("oferta pós-primeira tiragem grátis", () => {
  it("mostra apenas aprofundamentos de 5 e 7 cartas com preços oficiais", () => {
    const offers = getPostFreeUpgradeOffers(3);
    expect(offers.map(o => o.plan)).toEqual(["profunda", "completa"]);
    expect(offers.map(o => o.extraCards)).toEqual([2, 4]);
    expect(offers.map(o => o.priceCents)).toEqual([890, 1490]);
    expect(offers.every(o => o.priceCents === PLANS[o.plan].priceCents)).toBe(true);
  });
  it("não recomenda outras consultas quando não é a leitura grátis de três cartas", () => {
    expect(getPostFreeUpgradeOffers(0)).toEqual([]);
    expect(getPostFreeUpgradeOffers(5)).toEqual([]);
    expect(getPostFreeUpgradeOffers(Number.NaN)).toEqual([]);
  });
  it("explica benefícios distintos e verdadeiros para cada plano", () => {
    const [five,seven] = getPostFreeUpgradeOffers(3);
    expect(five!.description).toContain("conselho");
    expect(five!.description).not.toContain("o que está oculto");
    expect(seven!.description).toContain("o que está oculto");
    expect(seven!.description).toContain("desfecho");
  });
});
