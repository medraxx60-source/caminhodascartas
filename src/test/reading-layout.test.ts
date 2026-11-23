import { describe, expect, it } from "vitest";
import { layoutReading } from "@/lib/reading-layout";

const text = `Olhe, que bonito. O Trevo abrindo mostra leveza. É positiva.

Os Pássaros no meio são preocupações. Isso cansa.

E o Cachorro fechando é lealdade. Cuide dos Pássaros.

Em resumo: tudo bem.`;

describe("layoutReading", () => {
  it("assigns passages to cards in order and keeps all text", () => {
    const r = layoutReading(text, [1, 11, 17]);
    expect(r.intro).toEqual(["Olhe, que bonito."]);
    expect(r.perCard[0]).toEqual(["O Trevo abrindo mostra leveza. É positiva."]);
    expect(r.perCard[1]).toEqual(["Os Pássaros no meio são preocupações. Isso cansa."]);
    expect(r.perCard[2]).toEqual(["E o Cachorro fechando é lealdade. Cuide dos Pássaros."]);
    expect(r.conclusion).toEqual(["Em resumo: tudo bem."]);
    const all = [...r.intro, ...r.perCard.flat(), ...r.conclusion].join(" ").replace(/\s+/g, "");
    expect(all).toBe(text.replace(/\s+/g, ""));
  });
});

describe("resposta não estruturada da MandAPI", () => {
  it("não descarta texto quando nenhuma carta é nomeada", () => {
    const raw = "A situação pede calma e observação.\\n\\nSeu próximo passo deve considerar os fatos.";
    const r = layoutReading(raw, [0, 20, 30]);
    expect(r.intro).toEqual([]);
    expect(r.perCard).toEqual([[], [], []]);
    expect(r.conclusion.join("\\n\\n")).toBe(raw);
  });
});

describe("sinônimos tradicionais sem perder o texto das cartas", () => {
  it("separa Ratos, Árvore e Serpente como Rato, Árvore e Cobra", () => {
    const raw = [
      "A mesa chama a atenção por uma tensão antiga.",
      "Os Ratos, abrindo a tiragem, sugerem um desgaste acumulado.",
      "A Árvore, no meio, ajuda a compreender como essa situação ganhou raízes.",
      "A Serpente, encerrando, pede discernimento para uma mudança de rumo.",
      "O caminho pede atenção ao que se repete.",
    ].join("\n\n");
    const out = layoutReading(raw, [22, 4, 6]);
    expect(out.intro).toEqual(["A mesa chama a atenção por uma tensão antiga."]);
    expect(out.perCard[0]!.join(" ")).toContain("Os Ratos");
    expect(out.perCard[1]!.join(" ")).toContain("A Árvore");
    expect(out.perCard[2]!.join(" ")).toContain("A Serpente");
    expect(out.conclusion).toEqual(["O caminho pede atenção ao que se repete."]);
  });

  it("reconhece Cão, Flores e Estrelas sem alterar os nomes oficiais do baralho", () => {
    const raw = [
      "O Cão abre falando sobre lealdade.",
      "As Flores trazem leveza para a situação.",
      "As Estrelas apontam para um novo olhar.",
    ].join("\n\n");
    const out = layoutReading(raw, [17, 8, 15]);
    expect(out.perCard.every((part) => part.length > 0)).toBe(true);
  });

  it("aceita O Homem/A Mulher como títulos, mas não a menção genérica a um homem", () => {
    const raw = [
      "Havia um homem comum na situação apresentada.",
      "O Homem aparece simbolicamente como a primeira carta.",
      "A Mulher fecha a mesa com outro ponto de vista.",
    ].join("\n\n");
    const out = layoutReading(raw, [27, 28]);
    expect(out.intro).toEqual(["Havia um homem comum na situação apresentada."]);
    expect(out.perCard[0]!.join(" ")).toContain("O Homem");
    expect(out.perCard[1]!.join(" ")).toContain("A Mulher");
  });
});

import { layoutReading as lay2 } from "@/lib/reading-layout";
import { CARDS as C2 } from "@/lib/lenormand";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("palavras comuns não são cartas", () => {
  i2("'seu coração' em minúsculas não pula para a carta O Coração", () => {
    const a = C2.indexOf("A Chave"), b = C2.indexOf("O Sol"), c = C2.indexOf("O Coração");
    const text = "A Chave abre caminho e seu coração pede respostas.\n\nO Sol traz clareza.\n\nO Coração fala de amor.";
    const r = lay2(text, [a, b, c]);
    e2(r.perCard[0]!.join(" ")).toContain("seu coração pede respostas");
    e2(r.perCard[2]!.join(" ")).not.toContain("seu coração");
  });
});
