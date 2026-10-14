import cardBack from "@/assets/card-back.jpg";
import { CARDS } from "@/lib/lenormand";

export function CardBack({ selected, order }: { selected?: boolean | undefined; order?: number | undefined }) {
  return (
    <div className={`relative aspect-[5/8] overflow-hidden rounded-md transition-transform ${selected ? "-translate-y-2 ring-2 ring-gold" : ""}`}>
      <img src={cardBack} alt="Carta virada" width={640} height={1024} loading="lazy" className="h-full w-full object-cover" />
      {order !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center bg-primary/40 font-display text-2xl font-bold text-primary-foreground">
          {order}
        </span>
      )}
    </div>
  );
}

const CARD_IMAGES = import.meta.glob("@/assets/cards/*.jpg", { eager: true, import: "default" }) as Record<string, string>;
const cardImage = (index: number) =>
  Object.entries(CARD_IMAGES).find(([p]) => p.endsWith(`/${index + 1}.jpg`))?.[1];

export function CardFace({ index, position }: { index: number; position?: string | undefined }) {
  const src = cardImage(index);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative aspect-[5/8] w-28 overflow-hidden rounded-md shadow-md ring-1 ring-gold/40">
        {src && (
          <img src={src} alt={CARDS[index]} width={640} height={1024} loading="lazy" className="h-full w-full object-cover" />
        )}
        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 rounded-sm bg-background/85 px-1.5 font-display text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <span className="absolute inset-x-1.5 bottom-1.5 rounded-sm bg-background/90 px-1 py-0.5 text-center font-display text-xs font-semibold leading-tight text-primary">
          {CARDS[index]}
        </span>
      </div>
      {position && <span className="text-xs text-muted-foreground">{position}</span>}
    </div>
  );
}
