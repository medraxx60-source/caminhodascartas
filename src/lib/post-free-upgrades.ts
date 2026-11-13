import { PLANS, type PlanId } from "./lenormand";

/**
 * Produtos de aprofundamento após uma leitura gratuita concluída.
 * Preço total sempre vem da tabela oficial, nunca de texto promocional.
 */
const EXPLANATIONS = {
  profunda: {
    tag: "Bom equilíbrio",
    title: "Entenda melhor a sua pergunta",
    description: "Raiz da situação, desafio, tendência e conselho.",
  },
  completa: {
    tag: "Visão mais ampla",
    title: "Explore outros aspectos do caminho",
    description: "Inclui o que está oculto e um possível desfecho.",
  },
} as const;

export type PostFreeUpgradeOffer = {
  plan: "profunda" | "completa";
  count: number;
  extraCards: number;
  priceCents: number;
  title: string;
  description: string;
  tag: string;
};

/** Não cria valores ou condições promocionais e não promete acontecimentos. */
export function getPostFreeUpgradeOffers(alreadyPicked: number): PostFreeUpgradeOffer[] {
  if (!Number.isInteger(alreadyPicked) || alreadyPicked !== PLANS.essencial.count) return [];
  const targets: ("profunda" | "completa")[] = ["profunda", "completa"];
  return targets.map((plan) => ({
    plan,
    count: PLANS[plan].count,
    extraCards: PLANS[plan].count - alreadyPicked,
    priceCents: PLANS[plan].priceCents,
    ...EXPLANATIONS[plan],
  }));
}
