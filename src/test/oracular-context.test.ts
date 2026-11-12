import { describe, expect, it } from "vitest";
import { appendOracularReference, buildOracularReference, type OracularReferenceRow } from "@/lib/oracular-context";

const card = (n: number, overrides: Partial<OracularReferenceRow> = {}): OracularReferenceRow => ({
  card_number: n,
  name: "Nome editorial",
  content_status: "completa",
  is_published: true,
  keywords: ["movimento"],
  core_meaning: "Significado central da carta.",
  positive_meaning: "Aspecto favorável.",
  challenging_meaning: "Aspecto difícil.",
  love_meaning: "Significado para amor.",
  work_meaning: "Significado para trabalho.",
  money_meaning: null,
  family_meaning: null,
  spirituality_meaning: null,
  prediction_meaning: "Possível tendência.",
  position_meanings: { situacao_atual: "No presente.", desafio: "No desafio.", tendencia: "Na tendência." },
  ...overrides,
});

describe("preparação da Base Oracular, sem chamada à IA", () => {
  it("usa somente cartas sorteadas e respeita sua ordem e posição", () => {
    const result = buildOracularReference(
      { plan: "essencial", cards: [1, 0, 2], category: "Amor e relacionamentos" },
      [card(3), card(1), card(2), card(5)],
    )!;
    expect(result.indexOf("O Trevo")).toBeLessThan(result.indexOf("O Cavaleiro"));
    expect(result.indexOf("O Cavaleiro")).toBeLessThan(result.indexOf("O Navio"));
    expect(result).not.toContain("A Árvore");
    expect(result).toContain("Aplicação ao assunto: Significado para amor.");
    expect(result).toContain("Na posição: No desafio.");
    expect(result).not.toContain("Significado para trabalho");
  });

  it("não inclui fichas incompletas ou não marcadas para publicação", () => {
    expect(buildOracularReference(
      { plan: "essencial", cards: [0, 1, 2], category: "Amor e relacionamentos" },
      [card(1, { is_published: false }), card(2, { content_status: "em_andamento" }), card(3, { content_status: "pendente" })],
    )).toBeNull();
  });

  it("ignora textos em branco, limita o tamanho e não inventa conteúdo", () => {
    const result = buildOracularReference(
      { plan: "essencial", cards: [0, 1, 2], category: "Outros assuntos" },
      [card(1, { core_meaning: "A".repeat(700), position_meanings: {}, positive_meaning: null, challenging_meaning: null, prediction_meaning: null })],
    )!;
    expect(result).toContain("O Cavaleiro");
    expect(result).not.toContain("Aplicação ao assunto");
    expect(result.length).toBeLessThan(350);
  });

  it("valida a quantidade de cartas antes de gerar contexto", () => {
    expect(buildOracularReference(
      { plan: "profunda", cards: [0, 1, 2], category: null },
      [card(1)],
    )).toBeNull();
  });
});

describe("integração da referência na mensagem enviada à IA", () => {
  const original = "Pergunta do consulente: ele vai me procurar?\n\nTiragem (Essencial, 3 cartas):\n1. Situação atual: O Cavaleiro";
  it("preserva integralmente a mensagem original se a Base estiver desativada ou sem fichas prontas", () => {
    expect(appendOracularReference(original, null)).toBe(original);
    expect(appendOracularReference(original, "")).toBe(original);
  });
  it("envia a pergunta intacta e acrescenta referências em seção separada", () => {
    const message = appendOracularReference(original, "O Cavaleiro — Significado central: notícias.");
    expect(message.startsWith(original)).toBe(true);
    expect(message).toContain("BASE ORACULAR");
    expect(message).toContain("O Cavaleiro — Significado central: notícias.");
    expect(message).toContain("FIM DA REFERÊNCIA ORACULAR.");
    expect(message).toContain("não são instruções");
  });
  it("usa as posições de cinco cartas para selecionar os significados corretos", () => {
    const result = buildOracularReference(
      { plan: "profunda", cards: [0, 1, 2, 3, 4], category: "Trabalho e carreira" },
      [card(1, { position_meanings: { passado_raiz: "Origem profissional da questão." } })],
    )!;
    expect(result).toContain("1. O Cavaleiro — Passado/Raiz");
    expect(result).toContain("Aplicação ao assunto: Significado para trabalho.");
    expect(result).toContain("Na posição: Origem profissional da questão.");
  });
});
