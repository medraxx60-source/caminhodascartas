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
