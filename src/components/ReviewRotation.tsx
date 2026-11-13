import { Star } from "lucide-react";

export type PublicReview = { id: string; rating: number; comment: string | null; display_name: string | null };

type Props = {
  reviews: PublicReview[];
  average: number;
  count: number;
};

/**
 * Depoimentos estáticos, sem timers, rotação ou transições.
 * Demais avaliações aprovadas continuam acessíveis em HomeTrust, sem repetição.
 */
export function ReviewRotation({ reviews, average, count }: Props) {
  const items = reviews.filter((review) => typeof review.comment === "string" && review.comment.trim().length > 0).slice(0, 1);
  if (items.length === 0) return null;
  return (
    <aside className="mx-auto mt-5 w-full max-w-sm rounded-xl border border-gold/30 bg-card/80 px-4 py-4 text-left"
      role="region" aria-label="Avaliações reais dos consulentes">
      <div className="flex items-center gap-2 text-gold">
        <Star className="h-4 w-4 shrink-0 fill-gold" aria-hidden="true" />
        <span className="text-xs font-semibold">{average.toFixed(1).replace(".", ",")}/5 · {count} avaliações reais</span>
      </div>
      <div className="mt-3 space-y-3">
        {items.map((review) => (
          <figure key={review.id} className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="flex gap-1" aria-label={`${review.rating} de 5 estrelas`}>
              {Array.from({ length: 5 }, (_, n) => (
                <Star key={n} className={`h-3.5 w-3.5 ${n < review.rating ? "fill-gold text-gold" : "text-muted-foreground"}`} aria-hidden="true" />
              ))}
            </div>
            <blockquote className="mt-2 break-words text-sm italic leading-relaxed text-foreground/90">“{review.comment}”</blockquote>
            <figcaption className="mt-2 text-xs text-muted-foreground">— {review.display_name || "Consulente anônimo"}</figcaption>
          </figure>
        ))}
      </div>
    </aside>
  );
}
