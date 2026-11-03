import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { listPublicReviews } from "@/lib/reviews.functions";

const FAQ = [
  ["Como a leitura é feita?", "Você escolhe as cartas com a sua intenção. A interpretação é escrita por uma inteligência artificial treinada nos significados tradicionais do Baralho Cigano e nas combinações entre as cartas, seguindo o nosso jeito acolhedor de aconselhar."],
  ["Minha pergunta fica em sigilo?", "Sim. Não pedimos nome, e-mail nem cadastro. Sua pergunta nunca aparece para outras pessoas, e a leitura só abre pelo seu link pessoal."],
  ["Quanto tempo demora?", "A leitura gratuita sai em poucos segundos. Nas consultas pagas, assim que o Pix é confirmado a interpretação aparece sozinha na tela, em cerca de um minuto."],
  ["Posso ver minha leitura depois?", "Pode. Ela fica guardada em “Minhas leituras”, no menu ☰ do topo da tela, neste mesmo celular."],
  ["A leitura substitui um profissional?", "Não. O Baralho Cigano é uma ferramenta de reflexão e autoconhecimento. Para saúde, questões jurídicas ou financeiras, procure sempre um profissional."],
];

export function HomeTrust() {
  const { data } = useQuery({ queryKey: ["public-reviews"], queryFn: () => listPublicReviews(), staleTime: 60_000 });
  return (
    <>
      {data && data.count > 0 && (
        <section className="mt-12">
          <h2 className="text-center font-display text-2xl font-semibold text-primary">O que dizem os consulentes</h2>
          <p className="mt-2 flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-gold text-gold" /> {data.average.toFixed(1).replace(".", ",")} de 5 · {data.count} avaliação{data.count > 1 ? "ões" : ""}
          </p>
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
        </section>
      )}
      <section className="mt-12">
        <h2 className="text-center font-display text-2xl font-semibold text-primary">Perguntas frequentes</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-border bg-card transition-colors open:border-gold/60">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 p-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                <span className="text-lg text-gold transition-transform duration-200 group-open:rotate-45">+</span>{q}
              </summary>
              <p className="px-4 pb-4 leading-relaxed text-foreground/80">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
