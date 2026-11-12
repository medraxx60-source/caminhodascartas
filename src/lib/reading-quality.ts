import { CARDS } from "./lenormand";

export type ReadingQualityIssue = "short_reply" | "missing_card_reference" | "missing_angel_advice" | "formulaic_card_openings";

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
  // Apenas diagnóstico: identificar o estilo mecânico "O Sol mostra / O Caixão aponta".
  // Não reescrever respostas, não bloquear a leitura, não gastar mais créditos.
  const starts = reading.split(/\n\s*\n/).map((p) => p.trim());
  const formula = /^(?:O|A|Os|As)\s+[\p{L}\s]{2,30}(?:,\s*como\s+[^,]{1,40},)?\s+(?:mostra|aponta|indica|representa)\b/iu;
  if (starts.filter((p) => formula.test(p)).length >= 2) issues.push("formulaic_card_openings");
  return issues;
}
