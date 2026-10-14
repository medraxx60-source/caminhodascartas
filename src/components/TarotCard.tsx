import cardBack from "@/assets/card-back.jpg";
import { CARDS } from "@/lib/lenormand";

export function CardBack({ selected, order }: { selected?: boolean; order?: number }) {
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

export function CardFace({ index, position }: { index: number; position?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="card-face flex aspect-[5/8] w-24 flex-col items-center justify-between rounded-md p-2 text-center">
        <span className="font-display text-sm text-gold">{index + 1}</span>
        <span className="font-display text-base font-semibold leading-tight text-primary">{CARDS[index]}</span>
        <span className="text-gold">✦</span>
      </div>
      {position && <span className="text-xs text-muted-foreground">{position}</span>}
    </div>
  );
}
