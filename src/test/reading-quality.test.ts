import { describe, expect, it } from "vitest";
import { assessReadingQuality } from "@/lib/reading-quality";

describe("qualidade da resposta oracular sem cobrar nova IA", () => {
  it("detecta leitura curta e sem cartas", () => {
    expect(assessReadingQuality("Mensagem breve.", [0,20,30])).toEqual(["short_reply","missing_card_reference","missing_angel_advice"]);
  });
  it("não sinaliza resposta com todos os elementos", () => {
    const reading = "O Cavaleiro traz notícias. A Montanha sugere cautela. O Sol abre possibilidades. "
      + "O conjunto pede que você observe os sinais sem depender de certezas, reflita com calma e se prepare para agir se surgir uma oportunidade. "
      + "CONSELHO DOS ANJOS: mantenha esperança, discernimento e cuidado com seu próximo passo.";
    expect(assessReadingQuality(reading, [0,20,30])).toEqual([]);
  });
});

describe("diagnóstico de estilo Padrão Ouro", () => {
  it("sinaliza aberturas repetitivas sem impedir entrega da resposta", () => {
    const reading = [
      "O Sol mostra que a situação tem energia e proximidade.",
      "O Coração, como desafio, mostra que as expectativas pesam.",
      "O Caixão aponta para uma transformação ou encerramento.",
      "CONSELHO DOS ANJOS: observe os sinais com carinho.",
    ].join("\n\n");
    expect(assessReadingQuality(reading, [30, 23, 7])).toContain("formulaic_card_openings");
  });
  it("não confunde uma narrativa viva com repetição mecânica", () => {
    const reading = [
      "O Sol aquece a mesa, mas também ilumina o que ainda falta enxergar.",
      "Já o Coração pede atenção às expectativas criadas entre vocês.",
      "Com o Caixão fechando a sequência, uma fase parece se encerrar.",
      "CONSELHO DOS ANJOS: preserve sua serenidade.",
    ].join("\n\n");
    expect(assessReadingQuality(reading, [30, 23, 7])).not.toContain("formulaic_card_openings");
  });
});
