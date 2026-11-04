import { CARDS } from "@/lib/lenormand";

export type ReadingLayout = { intro: string[]; perCard: string[][]; conclusion: string[] };

const noun = (name: string) => name.replace(/^(O|A|Os|As)\s+/, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a reading into per-card passages without altering any text.
 * Sentences go to the card they first mention (moving forward only, preserving order);
 * text before the first card is intro; trailing paragraphs that introduce no new card are conclusion.
 */
export function layoutReading(main: string, cards: number[]): ReadingLayout {
  const patterns = cards.map((c) => new RegExp(`(^|[^\\p{L}])${escape(noun(CARDS[c] ?? ""))}(?![\\p{L}])`, "u"));
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
  return { intro, perCard, conclusion };
}
