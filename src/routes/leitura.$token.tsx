import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardFace, cardImage } from "@/components/TarotCard";
import { CARDS, PLANS, formatBRL, type PlanId } from "@/lib/lenormand";
import { layoutReading } from "@/lib/reading-layout";
import { EXPANSION_KEY } from "@/lib/reading-expansion";
import { getOrderByToken, runFreeGeneration, resumePaidGeneration } from "@/lib/orders.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReviewBox } from "@/components/ReviewBox";
import { giftWhatsAppHref } from "@/components/StoryImageButton";
import { HelpButton } from "@/components/HelpButton";

const orderQuery = (token: string) =>
  queryOptions({
    queryKey: ["order", token],
    queryFn: () => getOrderByToken({ data: { token } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "done" || s === "rejected") return false;
      return s === "generating" ? 2000 : 3000;
    },
    refetchIntervalInBackground: false,
  });

const PROGRESS_STEPS = [
  "Cruzando a energia da sua pergunta com as cartas",
  "Analisando a influência de cada posição",
  "Conectando as combinações e o que está oculto",
  "Estruturando a sua orientação prática",
  "Acolhendo o Conselho dos Anjos",
];

const REFLECTIONS = [
  "As cartas não determinam seu destino; elas iluminam as escolhas que você tem nas mãos.",
  "Respire fundo e mantenha o pensamento na sua pergunta.",
  "Cada combinação é lida com atenção aos detalhes da sua história.",
  "O que está oculto aos olhos muitas vezes já é sentido pelo coração.",
  "Sua orientação está sendo preparada com cuidado e acolhimento.",
];

function GeneratingProgress({ isFree }: { isFree: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Paced to the real AI time (~40s): each step ~8s; bar never hits 100% until the reading arrives.
  const step = Math.min(PROGRESS_STEPS.length - 1, Math.floor(elapsed / 8));
  const pct = Math.round(96 * (1 - Math.exp(-elapsed / 15)));
  const quoteIdx = Math.floor(elapsed / 8) % REFLECTIONS.length;
  return (
    <div className="mt-10 rounded-xl border border-gold bg-card p-6 text-center" role="status" aria-live="polite">
      <p className="text-2xl text-gold animate-pulse" aria-hidden>✦</p>
      <p className="mt-1 font-display text-2xl leading-snug text-primary">
        {isFree ? "Sua mesa está aberta" : "Pagamento confirmado"}
      </p>
      <p className="mt-1 text-base text-muted-foreground">
        {isFree ? "Consultando o Baralho Cigano…" : "A cartomante está diante da sua mesa…"}
      </p>
      <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-gold transition-all duration-1000 ease-out" style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
      <ol className="mx-auto mt-5 max-w-sm space-y-2.5 text-left text-base">
        {PROGRESS_STEPS.map((label, i) => (
          <li key={label} className={`flex gap-2 ${i < step ? "text-muted-foreground" : i === step ? "font-semibold text-primary" : "text-muted-foreground/50"}`}>
            <span className={`w-4 shrink-0 text-gold ${i === step ? "animate-pulse" : ""}`} aria-hidden>{i < step ? "✓" : i === step ? "✦" : "○"}</span>
            <span>{label}{i === step ? "…" : ""}</span>
          </li>
        ))}
      </ol>
      <div className="mx-auto mt-6 flex min-h-24 max-w-sm items-center justify-center rounded-lg border border-gold/40 bg-background/40 px-4 py-3">
        <p key={quoteIdx} className="font-display text-lg italic leading-relaxed text-foreground/90 animate-in fade-in duration-700">
          “{REFLECTIONS[quoteIdx]}”
        </p>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">Leva cerca de 40 segundos. Pode deixar esta página aberta.</p>
    </div>
  );
}

export const Route = createFileRoute("/leitura/$token")({
  head: () => ({
    meta: [
      { title: "Sua leitura — Caminho das Cartas" },
      { name: "description", content: "Sua leitura privada de Baralho Cigano." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sua leitura — Caminho das Cartas" },
      { property: "og:description", content: "Leitura privada de Baralho Cigano." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orderQuery(params.token)),
  errorComponent: () => <Missing />,
  component: Leitura,
});

function Missing() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="text-4xl font-bold text-primary">Link não encontrado</h1>
      <Link to="/" className="mt-6 inline-block text-gold underline">Voltar ao início</Link>
    </main>
  );
}

function Leitura() {
  const { token } = Route.useParams();
  const { data: order } = useSuspenseQuery(orderQuery(token));
  const runFree = useServerFn(runFreeGeneration);
  const resumePaid = useServerFn(resumePaidGeneration);
  const qc = useQueryClient();
  // If a paid reading stalls (approval request interrupted), retry it from here; the server only acts after 90s.
  const isPaidStuck = !!order && !order.is_free && (order.status === "generating" || order.status === "error");
  useEffect(() => {
    if (!isPaidStuck) return;
    let busy = false;
    const tryResume = () => {
      if (busy) return; busy = true;
      resumePaid({ data: { token } }).catch(() => {}).finally(() => { busy = false; qc.invalidateQueries({ queryKey: ["order", token] }); });
    };
    tryResume();
    const id = setInterval(tryResume, 30000);
    return () => clearInterval(id);
  }, [isPaidStuck, token, resumePaid, qc]);
  const [started, setStarted] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const startFree = (manual = false) => {
    setStarted(true);
    if (manual) { setRetryBusy(true); setRetryError(null); }
    runFree({ data: { token } })
      .then((r) => { if (manual && !r?.ok) setRetryError("Não conseguimos concluir agora. Aguarde um instante e tente de novo."); })
      .catch((e) => {
        if (!manual) return;
        const msg = e instanceof Error && e.message && !/fetch|network|failed/i.test(e.message) ? e.message : "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
        setRetryError(msg); toast.error(msg);
      })
      .finally(() => { setRetryBusy(false); qc.invalidateQueries({ queryKey: ["order", token] }); });
    setTimeout(() => qc.invalidateQueries({ queryKey: ["order", token] }), 800);
  };
  // A free reading stuck in "generating" (connection dropped, tab closed) is retaken here; the server only acts after 2 min.
  const isFreeStuck = !!order?.is_free && order.status === "generating";
  useEffect(() => {
    if (!isFreeStuck) return;
    const id = setInterval(() => { runFree({ data: { token } }).catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ["order", token] })); }, 30000);
    return () => clearInterval(id);
  }, [isFreeStuck, token, runFree, qc]);
  useEffect(() => {
    if (!order) return;
    try {
      const list: { token: string; at: string; plan: string }[] = JSON.parse(localStorage.getItem("entre_cartas_readings") || "[]");
      if (!list.some((r) => r.token === token)) {
        list.unshift({ token, at: order.created_at, plan: order.plan });
        localStorage.setItem("entre_cartas_readings", JSON.stringify(list.slice(0, 20)));
      }
    } catch {}
  }, [token, !!order]);
  useEffect(() => {
    if (order?.is_free && order.status === "pending" && !started) startFree();
  }, [order?.is_free, order?.status]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); }, [token, order?.status]);
  if (!order) return <Missing />;
  const plan = PLANS[order.plan as PlanId];

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold">← Voltar ao início</Link>
      <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-gold">Caminho das Cartas · {plan.name}</p>
      <h1 className="mt-3 text-center text-4xl font-bold text-primary">Sua leitura</h1>
      <div className="gold-rule mx-auto mt-5 w-40" />
      <blockquote className="mt-8 rounded-lg border border-border bg-card p-4 font-display text-xl italic">“{order.question}”</blockquote>
      {order.status !== "done" && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {(order.cards as number[]).map((c, i) => <CardFace key={c} index={c} position={plan.positions[i]} />)}
        </div>
      )}
      {order.status === "done" && order.reading ? (() => {
        const [main, angels] = order.reading.split(/\n*\s*CONSELHO DOS ANJOS:?\s*/i);
        const cards = order.cards as number[];
        const lay = layoutReading((main ?? "").trim(), cards);
        return (
          <>
            {lay.intro.length > 0 && (
              <div className="mt-8 space-y-4 leading-relaxed">{lay.intro.map((p, k) => <p key={k}>{p}</p>)}</div>
            )}
            <div className="mt-8 space-y-6">
              {cards.map((c, i) => (
                <section key={c} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="aspect-[5/8] w-20 shrink-0 overflow-hidden rounded-md shadow-md ring-1 ring-gold/50">
                      {cardImage(c) && <img src={cardImage(c)} alt={CARDS[c]} width={640} height={1024} loading="lazy" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gold">{i + 1}ª · {plan.positions[i]}</p>
                      <h2 className="mt-1 font-display text-2xl font-semibold text-primary">{CARDS[c]}</h2>
                      <p className="text-xs text-muted-foreground">Carta {c + 1}</p>
                    </div>
                  </div>
                  {lay.perCard[i]!.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-border/60 pt-4 leading-relaxed">
                      {lay.perCard[i]!.map((p, k) => <p key={k}>{p}</p>)}
                    </div>
                  )}
                </section>
              ))}
            </div>
            {lay.conclusion.length > 0 && (
              <section className="mt-10">
                <h2 className="text-center font-display text-2xl font-semibold text-primary">{lay.perCard.every((part) => part.length === 0) ? "Interpretação da tiragem" : "Conclusão da leitura"}</h2>
                <div className="gold-rule mx-auto mt-3 w-24" />
                <div className="mt-4 space-y-4 leading-relaxed">{lay.conclusion.map((p, k) => <p key={k}>{p}</p>)}</div>
              </section>
            )}
            {angels?.trim() && (
              <section className="mt-10 rounded-xl border-2 border-gold bg-card p-6 text-center shadow-sm">
                <p className="text-2xl text-gold">✦</p>
                <h2 className="mt-1 font-display text-3xl font-semibold text-primary">Conselho dos Anjos</h2>
                <div className="gold-rule mx-auto mt-3 w-24" />
                <p className="mt-4 whitespace-pre-line font-display text-xl italic leading-relaxed">{angels.trim()}</p>
              </section>
            )}
          </>
        );
      })() : order.status === "rejected" ? (
        <div className="mt-10 rounded-lg border border-destructive bg-card p-6 text-center">
          <p className="font-display text-2xl text-destructive">Pedido não aprovado</p>
          <p className="mt-2 text-sm text-muted-foreground">Não conseguimos confirmar o pagamento deste pedido. Se você pagou, entre em contato informando o número do pedido.</p>
        </div>
      ) : order.is_free && order.status === "pending" ? (
        <GeneratingProgress isFree />
      ) : order.status === "error" ? (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary">Não conseguimos concluir sua leitura agora</p>
          <p className="mt-2 text-sm text-muted-foreground">Sua leitura de cortesia não foi consumida. Toque abaixo para tentar novamente.</p>
          <Button className="mt-4" disabled={retryBusy} onClick={() => startFree(true)}>{retryBusy ? "Tentando…" : "Tentar novamente"}</Button>
          {retryError && <p role="alert" className="mt-3 text-sm text-destructive">{retryError}</p>}
        </div>
      ) : order.status === "generating" ? (
        <GeneratingProgress isFree={!!order.is_free} />
      ) : (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary">Aguardando confirmação do pagamento</p>
          <p className="mt-2 text-sm text-muted-foreground">Assim que seu Pix for confirmado, sua leitura aparecerá aqui automaticamente. Deixe esta página aberta.</p>
        </div>
      )}
      {order.status === "done" ? (
        <NextReading planId={order.plan as PlanId} category={(order as { category?: string | null }).category ?? null} isFree={!!order.is_free} token={token} advice={(order.reading?.split(/\n*\s*CONSELHO DOS ANJOS:?\s*/i)[1] ?? "").trim()} question={order.question ?? ""} cards={(order.cards as number[]) ?? []} />
      ) : (
        <div className="mt-12 rounded-xl border border-gold/50 bg-card/70 p-5 text-center">
          <Button asChild size="lg" className="gold-button h-14 w-full rounded-xl text-lg">
            <Link to="/">Fazer nova consulta</Link>
          </Button>
        </div>
      )}
      <HelpButton screen="leitura" />
    </main>
  );
}

const OTHER_TOPIC: Record<string, string> = {
  "Amor e relacionamentos": "Dinheiro e prosperidade",
  "Trabalho e carreira": "Dinheiro e prosperidade",
  "Dinheiro e prosperidade": "Trabalho e carreira",
  "Família e vida pessoal": "Amor e relacionamentos",
  "Espiritualidade e autoconhecimento": "Amor e relacionamentos",
  "Saúde e bem-estar": "Espiritualidade e autoconhecimento",
  "Outros assuntos": "Amor e relacionamentos",
};

function NextReading({ planId, category, isFree, token, advice, question, cards }: { planId: PlanId; category: string | null; isFree: boolean; token: string; advice: string; question: string; cards: number[] }) {
  const [showReview, setShowReview] = useState(false);
  const cat = category && category in OTHER_TOPIC ? category : "Outros assuntos";
  const other = OTHER_TOPIC[cat]!;
  const deeperPlans: PlanId[] = planId === "completa" ? [] : planId === "profunda" ? ["completa"] : ["profunda", "completa"];
  const href = (plano: PlanId | null, categoria: string) =>
    `/?${new URLSearchParams({ ...(plano ? { plano } : {}), categoria }).toString()}`;
  // Expansion keeps the same question and the cards already drawn; the user only picks the missing ones.
  const expandHref = (plano: PlanId) =>
    `/?${new URLSearchParams({ plano, categoria: cat }).toString()}`;
  return (
    <section className="mt-12 rounded-xl border border-gold/50 bg-card/70 p-5 text-center">
      <p className="text-2xl text-gold">✦</p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-primary">Continue seu caminho</h2>
      <p className="mt-2 text-base text-foreground/90">
        {isFree
          ? `As 3 cartas mostraram sua situação, o desafio e a tendência. Mas há influências ocultas agindo nos bastidores que uma tiragem curta só sinaliza. Suas cartas continuam na mesa: abra mais cartas sobre a mesma pergunta e veja o que está escondido, o conselho e o desfecho do seu caminho.`
          : deeperPlans.length
            ? "Suas cartas continuam na mesa. Abra mais cartas sobre a mesma pergunta para ver o desfecho, ou pergunte sobre outra área da sua vida."
            : "As cartas mostram um momento. Quando quiser, pergunte sobre outra área da sua vida."}
      </p>
      <div className="mt-5 space-y-3">
        {deeperPlans.map((d, i) => (
          <Button key={d} asChild size="lg" variant={i === 0 ? "default" : "outline"} className={i === 0 ? "gold-button h-auto min-h-14 w-full whitespace-normal rounded-xl py-3 text-base leading-snug" : "h-auto min-h-12 w-full whitespace-normal rounded-xl border-gold py-3 text-base leading-snug text-gold"}>
            <a href={expandHref(d)} onClick={(event) => {
              try {
                sessionStorage.setItem(EXPANSION_KEY, JSON.stringify({ plan: d, question, cards, at: Date.now() }));
              } catch {
                event.preventDefault();
                toast.error("Não foi possível preservar sua pergunta neste navegador. Tente novamente.");
              }
            }}>✦ Expandir para {PLANS[d].count} cartas · {PLANS[d].name} ({formatBRL(PLANS[d].priceCents)})<br /><span className="text-sm opacity-80">Suas {cards.length} cartas continuam na mesa · escolha mais {PLANS[d].count - cards.length}</span></a>
          </Button>
        ))}
        <Button asChild size="lg" variant="outline" className="h-auto min-h-12 w-full whitespace-normal rounded-xl border-gold py-3 text-base leading-snug text-gold">
          <a href={href(null, other)}>Perguntar sobre {other}</a>
        </Button>
        <Link to="/" className="block py-1 text-sm text-gold underline-offset-4 hover:underline">Fazer outra consulta do zero</Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/60 pt-4 text-sm">
        <a href={giftWhatsAppHref(advice)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border bg-background/40 px-2 py-3 text-foreground/90 hover:border-gold">
          🎁 Presentear um amigo
        </a>
        <button type="button" onClick={() => setShowReview((v) => !v)} aria-expanded={showReview} className="rounded-lg border border-border bg-background/40 px-2 py-3 text-foreground/90 hover:border-gold">
          ⭐ Avaliar leitura
        </button>
      </div>
      {showReview && <ReviewBox token={token} />}
      <p className="mt-3 rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">✓ Esta leitura ficou salva neste aparelho. Releia quando quiser em “Minhas leituras”, no menu ☰ da tela inicial.</p>
    </section>
  );
}
