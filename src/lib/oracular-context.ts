import { CARDS, PLANS, type PlanId } from "./lenormand";

// Apenas dados de referência; nenhuma ficha administrativa é instrução para a IA.
// Mantém a Base Oracular privada e não ativa automaticamente fichas em elaboração.
export type OracularReferenceRow = {
  card_number: number;
  name: string;
  content_status: string;
  is_published: boolean;
  keywords: string[] | null;
  core_meaning: string | null;
  positive_meaning: string | null;
  challenging_meaning: string | null;
  love_meaning: string | null;
  work_meaning: string | null;
  money_meaning: string | null;
  family_meaning: string | null;
  spirituality_meaning: string | null;
  prediction_meaning: string | null;
  position_meanings: Record<string, unknown> | null;
};

const CATEGORY_KEY: Record<string, keyof OracularReferenceRow> = {
  "Amor e relacionamentos": "love_meaning",
  "Trabalho e carreira": "work_meaning",
  "Dinheiro e prosperidade": "money_meaning",
  "Família e vida pessoal": "family_meaning",
  "Espiritualidade e autoconhecimento": "spirituality_meaning",
};

const POSITION_KEY: Record<string, string> = {
  "Situação atual": "situacao_atual",
  "Desafio": "desafio",
  "Tendência": "tendencia",
  "Passado/Raiz": "passado_raiz",
  "Momento presente": "momento_presente",
  "O que está oculto": "o_que_esta_oculto",
  "Conselho": "conselho",
  "Desfecho": "desfecho",
};

function brief(input: unknown, max = 220): string {
  if (typeof input !== "string") return "";
  const clean = input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

export function buildOracularReference(
  order: { plan: PlanId; cards: number[]; category: string | null },
  rows: OracularReferenceRow[],
): string | null {
  const plan = PLANS[order.plan];
  if (!plan || order.cards.length !== plan.count) return null;
  const allowed = new Map(rows.filter((r) =>
    r.is_published && r.content_status === "completa" &&
    Number.isInteger(r.card_number) && r.card_number >= 1 && r.card_number <= CARDS.length
  ).map((r) => [r.card_number, r]));
  const categoryKey = order.category ? CATEGORY_KEY[order.category] : undefined;
  const sections: string[] = [];
  order.cards.forEach((index, position) => {
    if (!Number.isInteger(index) || index < 0 || index >= CARDS.length) return;
    const record = allowed.get(index + 1);
    if (!record) return;
    const positionLabel = plan.positions[position];
    const positionKey = POSITION_KEY[positionLabel];
    const chunks: string[] = [];
    const add = (label: string, value: unknown, limit = 220) => {
      const short = brief(value, limit);
      if (short) chunks.push(`${label}: ${short}`);
    };
    add("Significado central", record.core_meaning, 210);
    if (categoryKey) add("Aplicação ao assunto", record[categoryKey], 190);
    if (positionKey) add("Na posição", record.position_meanings?.[positionKey], 190);
    add("Aspecto favorável", record.positive_meaning, 110);
    add("Aspecto desafiador", record.challenging_meaning, 110);
    add("Tendência simbólica", record.prediction_meaning, 160);
    if (chunks.length) sections.push(
      `${position + 1}. ${CARDS[index]} — ${positionLabel}\n${chunks.join("\n")}`
    );
  });
  return sections.length ? sections.join("\n\n") : null;
}
