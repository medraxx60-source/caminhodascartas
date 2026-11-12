import { describe, expect, it } from "vitest";
import { parseExpansion } from "@/lib/reading-expansion";

const now = 1794500000000;
describe("aprofundamento privado de leitura", () => {
  const valid = JSON.stringify({ plan: "profunda", question: "Como evolui minha relação?", cards: [0, 4, 15], at: now });
  it("recupera as cartas da mesma aba sem colocá-las na URL", () => {
    expect(parseExpansion(valid, "profunda", now)).toEqual({question:"Como evolui minha relação?",cards:[0,4,15]});
  });
  it("recusa plano diferente e conteúdo vencido", () => {
    expect(parseExpansion(valid, "completa", now)).toBeNull();
    expect(parseExpansion(valid, "profunda", now + 16*60*1000)).toBeNull();
  });
  it("recusa cartas inválidas ou repetidas", () => {
    expect(parseExpansion(JSON.stringify({plan:"profunda",question:"Pergunta válida",cards:[0,0],at:now}),"profunda",now)).toBeNull();
  });
});
