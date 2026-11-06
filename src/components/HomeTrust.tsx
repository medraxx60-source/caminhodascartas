import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { listPublicReviews } from "@/lib/reviews.functions";

const FAQ = [
  ["Como a leitura é feita?", "Você escolhe as cartas com a sua intenção. A interpretação é escrita por uma inteligência artificial treinada nos significados tradicionais do Baralho Cigano e nas combinações entre as cartas, seguindo o nosso jeito acolhedor de aconselhar."],
  ["Minha pergunta fica em sigilo?", "Sim. Não pedimos nome, e-mail nem cadastro. Sua pergunta nunca aparece para outras pessoas, e a leitura só abre pelo seu link pessoal."],
  ["Quanto tempo demora?", "A leitura gratuita sai em poucos segundos. Nas consultas pagas, assim que o Pix é confirmado a interpretação aparece sozinha na tela, em cerca de um minuto."],
];

const toggle = "cursor-pointer list-none text-center font-display text-xl font-semibold text-primary";

export function HomeTrust() {
  const { data } = useQuery({ queryKey: ["public-reviews"], queryFn: () => listPublicReviews(), staleTime: 60_000 });
  return (
    <div className="mt-12 space-y-4">
      {data && data.count > 0 && (
        <details className="group rounded-xl border border-border bg-card/50 p-4">
          <summary className={toggle}>
            O que dizem os consulentes <span className="text-gold group-open:hidden">+</span><span className="hidden text-gold group-open:inline">−</span>
            <span className="mt-1 flex items-center justify-center gap-1 font-sans text-sm font-normal text-muted-foreground">
              <Star className="h-4 w-4 fill-gold text-gold" /> {data.average.toFixed(1).replace(".", ",")} de 5 · {data.count} avaliação{data.count > 1 ? "ões" : ""}
            </span>
          </summary>
          <div className="mt-4 space-y-3">
            {data.items.map((r) => (
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
