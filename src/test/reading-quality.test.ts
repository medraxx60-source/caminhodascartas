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
