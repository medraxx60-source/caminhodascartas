import { CARDS } from "./lenormand";

export type ReadingQualityIssue = "short_reply" | "missing_card_reference" | "missing_angel_advice";

/** Observabilidade, não bloqueia leitura paga por diferenças de formatação da IA. */
export function assessReadingQuality(reading: string, cards: number[]): ReadingQualityIssue[] {
  const issues: ReadingQualityIssue[] = [];
  const text = reading.trim().toLocaleLowerCase("pt-BR");
  if (text.length < 180) issues.push("short_reply");
  if (cards.some(n => {
    const name = CARDS[n]?.replace(/^(O|A|Os|As)\s+/, "").toLocaleLowerCase("pt-BR");
    return !name || !text.includes(name);
  })) issues.push("missing_card_reference");
  if (!text.includes("conselho dos anjos")) issues.push("missing_angel_advice");
  return issues;
}
