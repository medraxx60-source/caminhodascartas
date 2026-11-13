import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { listPublicReviews } from "@/lib/reviews.functions";
import { ReviewRotation } from "@/components/ReviewRotation";

const FAQ = [
  ["Como funciona?", "Você escolhe as cartas. A interpretação é feita por IA, considerando sua pergunta e o Baralho Cigano."],
  ["Minha pergunta é privada?", "Sim. Não exigimos cadastro. A leitura fica acessível por um link pessoal; compartilhe-o apenas se quiser."],
  ["Quanto demora?", "O tempo pode variar. Sua consulta fica salva, inclusive se a geração demorar. Não pague novamente."],
];

const toggle = "cursor-pointer list-none text-center font-display text-xl font-semibold text-primary";

export function HomeTrust() {
  const { data } = useQuery({ queryKey: ["public-reviews"], queryFn: () => listPublicReviews(), staleTime: 60_000 });
  const featured = data?.items.find((r) => !!r.comment?.trim());
  const otherReviews = data?.items.filter((r) => r.id !== featured?.id) ?? [];
  return (
    <div className="mt-12 space-y-4">
      {data && otherReviews.length > 0 && (
        <details className="group rounded-xl border border-border bg-card/50 p-4">
          <summary className={toggle}>
            Mais avaliações <span className="text-gold group-open:hidden">+</span><span className="hidden text-gold group-open:inline">−</span>
            <span className="mt-1 flex items-center justify-center gap-1 font-sans text-sm font-normal text-muted-foreground">
              <Star className="h-4 w-4 fill-gold text-gold" /> {data.average.toFixed(1).replace(".", ",")} de 5 · {data.count} avaliação{data.count > 1 ? "ões" : ""}
            </span>
          </summary>
          <div className="mt-4 space-y-3">
            {otherReviews.map((r) => (
              <figure key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex gap-0.5" aria-label={`${r.rating} de 5`}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-gold text-gold" : "text-muted-foreground"}`} />)}
                </div>
                <blockquote className="mt-2 italic leading-relaxed">“{r.comment}”</blockquote>
                <figcaption className="mt-2 text-xs text-muted-foreground">— {r.display_name || "Consulente anônimo"}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
      <details className="group rounded-xl border border-border bg-card/50 p-4">
        <summary className={toggle}>
          Perguntas frequentes <span className="text-gold group-open:hidden">+</span><span className="hidden text-gold group-open:inline">−</span>
        </summary>
        <div className="mt-4 space-y-4">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <p className="text-base font-semibold text-foreground">{q}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{a}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Prova social genuína, estática e visível, sem mudar a lista indexável. */
export function HomeProof() {
  const { data } = useQuery({ queryKey: ["public-reviews"], queryFn: () => listPublicReviews(), staleTime: 60_000 });
  if (!data?.count || !data.items.some((review) => !!review.comment?.trim())) return null;
  return <ReviewRotation reviews={data.items} average={data.average} count={data.count} />;
}
