import { describe, expect, it } from "vitest";
import { actionForCards, questionAfterCategoryChange } from "@/lib/consultation-flow";

const ideas = {
  Amor: ["Como estão as energias entre nós?", "O que devo saber sobre essa relação?"],
  Dinheiro: ["O que preciso entender sobre minhas finanças?"],
};
describe("fluxo com uma ação principal por etapa", () => {
  it("não insere exemplos automaticamente ao escolher ou mudar o assunto", () => {
    expect(questionAfterCategoryChange("",ideas)).toBe("");
    expect(questionAfterCategoryChange("Como estão as energias entre nós?",ideas)).toBe("");
  });
  it("preserva a pergunta pessoal ao trocar de categoria", () => {
    const own = "Quero entender como lidar melhor com meus compromissos profissionais.";
    expect(questionAfterCategoryChange(own,ideas)).toBe(own);
  });
  it("usa CTA claro para receber grátis ou iniciar Pix e indica cartas restantes", () => {
    expect(actionForCards(0,3,true,"Grátis")).toBe("Escolha mais 3 cartas");
    expect(actionForCards(2,3,true,"Grátis")).toBe("Escolha mais 1 carta");
    expect(actionForCards(3,3,true,"Grátis")).toBe("Receber minha leitura grátis");
    expect(actionForCards(5,5,false,"R$ 8,90")).toBe("Ir para o Pix · R$ 8,90");
  });
});
