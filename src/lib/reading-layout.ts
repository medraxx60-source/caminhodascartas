import { CARDS } from "@/lib/lenormand";

export type ReadingLayout = { intro: string[]; perCard: string[][]; conclusion: string[] };

const noun = (name: string) => name.replace(/^(O|A|Os|As)\s+/, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Sinônimos tradicionais usados em fichas do Baralho Cigano.
 * Somente reconhecimento visual: a resposta original nunca é reescrita.
 * Homem/Mulher exigem artigo para reduzir coincidências com pessoas comuns.
 */
export const CARD_LAYOUT_ALIASES: Partial<Record<number, readonly string[]>> = {
  6: ["Serpente"],
  8: ["Flores"],
  15: ["Estrelas"],
  17: ["Cão"],
  22: ["Ratos"],
  27: ["O Homem"],
  28: ["A Mulher"],
};

function cardPattern(index: number): RegExp {
  const terms = [noun(CARDS[index] ?? ""), ...(CARD_LAYOUT_ALIASES[index] ?? [])];
  const joined = terms.map(escape).join("|");
  return new RegExp(`(^|[^\\p{L}])(?:${joined})(?![\\p{L}])`, "iu");
}


/**
 * Splits a reading into per-card passages without altering any text.
 * Sentences go to the card they first mention (moving forward only, preserving order);
 * text before the first card is intro; trailing paragraphs that introduce no new card are conclusion.
 */
export function layoutReading(main: string, cards: number[]): ReadingLayout {
  const patterns = cards.map(cardPattern);
  const paragraphs = main.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const intro: string[] = [];
  const perCard: string[][] = cards.map(() => []);
  const conclusion: string[] = [];
  let cur = -1;
  let lastAdvancePara = -1;
  const sentencesByPara = paragraphs.map((p) => p.match(/[^.!?…]+(?:[.!?…]+["”»)]*\s*|$)/g) ?? [p]);
  // Find last paragraph that advances to a new card.
  {
    let c = -1;
    sentencesByPara.forEach((ss, pi) => ss.forEach((s) => {
      for (let k = c + 1; k < cards.length; k++) if (patterns[k]!.test(s)) { c = k; lastAdvancePara = pi; break; }
    }));
  }
  sentencesByPara.forEach((ss, pi) => {
    if (cur >= 0 && pi > lastAdvancePara) { conclusion.push(paragraphs[pi]!); return; }
    let target: string[] | null = null;
    let buf = "";
    const flush = () => { if (buf.trim() && target) target.push(buf.trim()); buf = ""; };
    target = cur >= 0 ? perCard[cur]! : intro;
    for (const s of ss) {
      let next = -1;
      for (let k = cur + 1; k < cards.length; k++) if (patterns[k]!.test(s)) { next = k; break; }
      if (next !== -1) { flush(); cur = next; target = perCard[cur]!; }
      buf += s;
    }
    flush();
  });
  // Cards mentioned only inside another card's sentence (e.g. "A Cruz junto da Montanha") get that passage too, so no card is left blank.
  const all = sentencesByPara.flat().map((s) => s.trim());
  perCard.forEach((pc, i) => {
    if (pc.length) return;
    const hit = all.filter((s) => patterns[i]!.test(s));
    if (hit.length) pc.push(hit.join(" "));
  });
  // Se a IA escreveu a leitura inteira sem nomear cada carta, mostre o texto
  // completo como interpretação conjunta em vez de deixá-lo sobre cartões vazios.
  if (perCard.every((part) => part.length === 0) && paragraphs.length > 0) {
    return { intro: [], perCard, conclusion: paragraphs };
  }
  return { intro, perCard, conclusion };
}
