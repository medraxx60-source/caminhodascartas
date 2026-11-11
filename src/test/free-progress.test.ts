import { describe, it, expect } from "vitest";
import { parseProgress, keepPicksOnPlanChange, PROGRESS_TTL_MS } from "@/lib/free-progress";

const now = 10_000_000;
const ok = { plan: "essencial", category: "Amor e relacionamentos", question: "Ele volta?", picked: [4, 9, 20], step: 2, ritualDone: true, at: now - 1000 };
describe("progresso da leitura grátis", () => {
  it("recupera pergunta, cartas e etapa", () => expect(parseProgress(JSON.stringify(ok), now)).toMatchObject({ question: "Ele volta?", picked: [4, 9, 20], step: 2, ritualDone: true }));
  it("expira após 1 hora", () => expect(parseProgress(JSON.stringify({ ...ok, at: now - PROGRESS_TTL_MS - 1 }), now)).toBeNull());
  it("rejeita plano inválido", () => expect(parseProgress(JSON.stringify({ ...ok, plan: "gratis_vip" }), now)).toBeNull());
  it("rejeita mais cartas que o plano", () => expect(parseProgress(JSON.stringify({ ...ok, picked: [1, 2, 3, 4] }), now)).toBeNull());
  it("descarta cartas fora do baralho e repetidas", () => expect(parseProgress(JSON.stringify({ ...ok, picked: [4, 4, 99] }), now)?.picked).toEqual([4]));
  it("lixo não quebra", () => expect(parseProgress("{oops", now)).toBeNull());
  it("3 cartas continuam ao passar para 5 e 7, na mesma ordem", () => {
    expect(keepPicksOnPlanChange([4, 9, 20], "profunda")).toEqual([4, 9, 20]);
    expect(keepPicksOnPlanChange([4, 9, 20], "completa")).toEqual([4, 9, 20]);
    expect(keepPicksOnPlanChange([4, 9, 20], "essencial")).toEqual([4, 9, 20]);
  });
  it("5 cartas não cabem no plano de 3", () => expect(keepPicksOnPlanChange([1, 2, 3, 4, 5], "essencial")).toEqual([]));
});
