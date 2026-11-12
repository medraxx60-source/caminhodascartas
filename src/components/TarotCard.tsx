import cardBack from "@/assets/card-back.jpg";
import { CARDS } from "@/lib/lenormand";

export function CardBack({ selected, order }: { selected?: boolean | undefined; order?: number | undefined }) {
  return (
    <div className={`relative aspect-[5/8] overflow-hidden rounded-xl shadow-sm ${selected ? "-translate-y-2 shadow-lg ring-2 ring-gold ring-offset-2 ring-offset-card" : ""}`}>
      <img src={cardBack} alt="Carta virada" width={640} height={1024} loading="eager" decoding="async" fetchPriority="high" className="h-full w-full object-cover" />
      {order !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold bg-card font-display text-base font-bold text-primary shadow">
            {order}
          </span>
        </span>
      )}
    </div>
  );
}

const CARD_IMAGES = import.meta.glob("@/assets/cards/*.jpg", { eager: true, import: "default" }) as Record<string, string>;
export function CardReveal({ index, order }: { index: number; order: number }) {
  const src = cardImage(index);
  return (
    <div className="relative aspect-[5/8] overflow-hidden rounded-md shadow-lg">
      {src && <img src={src} alt={CARDS[index]} width={640} height={1024} className="h-full w-full object-cover" />}
      <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-gold bg-card font-display text-base font-bold text-primary shadow">{order}</span>
      <span className="absolute inset-x-2 bottom-2 rounded-sm bg-background/90 px-1 py-1 text-center font-display text-sm font-semibold text-primary">{index + 1} · {CARDS[index]}</span>
    </div>
  );
}

export const cardImage = (index: number) =>
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

let preloaded = false;
export function preloadCardImages() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  const all = [cardBack, ...Object.values(CARD_IMAGES)];
  all.forEach((src) => { const i = new Image(); i.decoding = "async"; i.src = src; i.decode?.().catch(() => {}); });
}
