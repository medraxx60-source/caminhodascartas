import { PLANS, type PlanId } from "./lenormand";

/** Sensitive carry-over data never belongs in a shareable query string. */
export const EXPANSION_KEY = "caminho_cartas_expansion_v1";
const MAX_AGE_MS = 15 * 60 * 1000;

export function parseExpansion(raw: string | null, targetPlan: string, now = Date.now()): { question: string; cards: number[] } | null {
  if (!raw || !(targetPlan in PLANS)) return null;
  try {
    const v = JSON.parse(raw) as { plan?: string; question?: string; cards?: unknown; at?: number };
    if (v.plan !== targetPlan || typeof v.question !== "string" ||
        v.question.trim().length < 5 || v.question.length > 1000 ||
        typeof v.at !== "number" || v.at > now + 60000 || now - v.at > MAX_AGE_MS) return null;
    if (!Array.isArray(v.cards)) return null;
    const cards = v.cards.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 36);
    if (cards.length !== v.cards.length || new Set(cards).size !== cards.length ||
        cards.length < 1 || cards.length >= PLANS[targetPlan as PlanId].count) return null;
    return { question: v.question, cards };
  } catch {
    return null;
  }
}
