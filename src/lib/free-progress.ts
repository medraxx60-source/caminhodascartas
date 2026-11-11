// Temporary progress of a free reading kept in sessionStorage (one tab, cleared when it closes). Never in the URL.
import { CARDS, CATEGORIES, PLANS, type PlanId } from "./lenormand";

export const PROGRESS_KEY = "cc_progress_v1";
export const PROGRESS_TTL_MS = 60 * 60 * 1000;
export type Progress = { plan: PlanId; category: string | null; question: string; picked: number[]; step: number; ritualDone: boolean; at: number };

export function parseProgress(raw: string | null, now: number = Date.now()): Progress | null {
  try {
    const d = JSON.parse(raw ?? "null");
    if (!d || typeof d !== "object" || !(d.plan in PLANS) || now - Number(d.at) > PROGRESS_TTL_MS) return null;
    const plan = d.plan as PlanId;
    const picked = Array.isArray(d.picked) ? [...new Set<number>(d.picked.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < CARDS.length) : [];
    if (picked.length > PLANS[plan].count) return null;
    const category = (CATEGORIES as readonly string[]).includes(d.category) ? d.category : null;
    const step = [1, 2].includes(d.step) ? d.step : 1;
    return { plan, category, question: String(d.question ?? "").slice(0, 1000), picked, step, ritualDone: !!d.ritualDone, at: Number(d.at) };
  } catch { return null; }
}

// Switching plan keeps the chosen cards (same order = same positions) when they still fit.
export function keepPicksOnPlanChange(picked: number[], to: PlanId) {
  return picked.length <= PLANS[to].count ? picked : [];
}
