import { describe, expect, it } from "vitest";
import { questionAfterCategoryChange } from "@/lib/question-flow";

const suggestions = {
  Amor: ["Como estão as energias entre nós?", "O que posso esperar da relação?"],
  Trabalho: ["Como vai meu trabalho?"],
};

describe("pergunta pessoal após escolher assunto", () => {
  it("não escolhe uma pergunta pelo visitante", () => {
    expect(questionAfterCategoryChange("", suggestions)).toBe("");
  });
  it("limpa um exemplo anterior ao mudar o assunto", () => {
    expect(questionAfterCategoryChange("Como estão as energias entre nós?", suggestions)).toBe("");
  });
  it("preserva perguntas escritas pela pessoa ao trocar o assunto", () => {
    const own = "Será que devo conversar com a pessoa que estou conhecendo?";
    expect(questionAfterCategoryChange(own, suggestions)).toBe(own);
  });
});
