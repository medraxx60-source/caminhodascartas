import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { nextReviewIndex } from "@/lib/review-rotation";

export type PublicReview = { id: string; rating: number; comment: string | null; display_name: string | null };

type Props = {
  reviews: PublicReview[];
  average: number;
  count: number;
};

/**
 * Carrossel de avaliações aprovadas.
 * Todas as avaliações seguem no HTML, ocupando a mesma célula de grid:
 * sem saltos de layout ao trocar e sem retirar comentários do DOM.
 */
export function ReviewRotation({ reviews, average, count }: Props) {
  const items = reviews.filter((review) => typeof review.comment === "string" && review.comment.trim().length > 0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion || !pageVisible) return;
    const timer = window.setInterval(() => setActive(i => nextReviewIndex(i, items.length)), 9000);
    return () => window.clearInterval(timer);
  }, [items.length, paused, reducedMotion, pageVisible]);

  if (!items.length) return null;
  const index = active >= items.length ? 0 : active;

  return (
    <aside className="cc-review-surface mx-auto mt-5 w-full max-w-sm rounded-xl border border-gold/30 bg-card/80 px-4 py-4 text-left"
      role="region" aria-label="Avaliações reais dos consulentes"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-gold">
          <Star className="h-4 w-4 shrink-0 fill-gold" aria-hidden="true" />
          <span className="text-xs font-semibold">{average.toFixed(1).replace(".", ",")}/5 · {count} avaliações reais</span>
        </span>
        {items.length > 1 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}/{items.length}</span>}
      </div>
      <div className="mt-3 grid" aria-live="off">
        {items.map((review, i) => (
          <figure key={review.id} aria-hidden={i !== index}
            className={`col-start-1 row-start-1 flex min-w-0 flex-col justify-between gap-3 motion-safe:transition-opacity motion-safe:duration-700 ${i === index ? "z-10 opacity-100" : "pointer-events-none opacity-0"}`}>
            <div>
              <div className="flex gap-1" aria-label={`${review.rating} de 5 estrelas`}>
                {Array.from({ length: 5 }, (_, n) => (
                  <Star key={n} className={`h-3.5 w-3.5 ${n < review.rating ? "fill-gold text-gold" : "text-muted-foreground"}`} aria-hidden="true" />
                ))}
              </div>
              <blockquote className="mt-2 break-words text-sm italic leading-relaxed text-foreground/90">“{review.comment}”</blockquote>
            </div>
            <figcaption className="text-xs text-muted-foreground">— {review.display_name || "Consulente anônimo"}</figcaption>
          </figure>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
          <button type="button" aria-label="Avaliação anterior" onClick={() => setActive(i => nextReviewIndex(i, items.length, -1))}
            className="cc-soft-interact flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 text-gold hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center justify-center gap-2" aria-label="Escolher avaliação">
            {items.map((item,i) => (
              <button key={item.id} type="button" aria-label={`Ver avaliação ${i+1} de ${items.length}`}
                aria-current={i === index ? "true" : undefined} onClick={() => setActive(i)}
                className="flex h-11 w-8 items-center justify-center focus-visible:outline-2 focus-visible:outline-gold">
                <span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-gold" : "w-1.5 bg-gold/40"}`} />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Próxima avaliação" onClick={() => setActive(i => nextReviewIndex(i, items.length))}
            className="cc-soft-interact flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 text-gold hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
}
