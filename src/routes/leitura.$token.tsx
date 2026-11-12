import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardFace, cardImage } from "@/components/TarotCard";
import { CARDS, PLANS, formatBRL, type PlanId } from "@/lib/lenormand";
import { layoutReading } from "@/lib/reading-layout";
import { EXPANSION_KEY } from "@/lib/reading-expansion";
import { PENDING_UPGRADE_KEY } from "@/lib/conversion-tracking";
import { useConversion } from "@/lib/use-conversion";
import { getPostFreeUpgradeOffers } from "@/lib/post-free-upgrades";
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
  // O tempo é imprevisível; não apresentar percentuais ou checkmarks falsos.
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
      <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" aria-label="Interpretação em preparação">
        <div className="h-full w-2/5 rounded-full bg-gold motion-safe:animate-pulse" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Os passos abaixo mostram como a tiragem é interpretada, não uma porcentagem de conclusão.</p>
      <ol className="mx-auto mt-5 max-w-sm space-y-2.5 text-left text-base">
        {PROGRESS_STEPS.map((label) => (
          <li key={label} className="flex gap-2 text-muted-foreground">
            <span className="w-4 shrink-0 text-gold" aria-hidden>✦</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="mx-auto mt-6 flex min-h-24 max-w-sm items-center justify-center rounded-lg border border-gold/40 bg-background/40 px-4 py-3">
        <p key={quoteIdx} className="font-display text-lg italic leading-relaxed text-foreground/90 animate-in fade-in duration-700">
          “{REFLECTIONS[quoteIdx]}”
        </p>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{elapsed < 45
        ? "Estamos preparando sua orientação. Você pode manter esta página aberta."
        : elapsed < 90
          ? "Está levando um pouco mais que o habitual. Seu pedido continua salvo; não faça outro Pix."
          : "Sua interpretação está demorando. O sistema pode retomar a geração automaticamente; seu pedido permanece salvo."}</p>
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
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
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
  const retryPaid = () => {
    setRetryBusy(true); setRetryError(null);
    resumePaid({ data: { token } })
      .then((r) => { if (!r?.ok) setRetryError("Ainda não conseguimos concluir. Seu pagamento está registrado; tente novamente em instantes."); })
      .catch(() => setRetryError("Não foi possível retomar agora. Sua leitura continua disponível neste pedido."))
      .finally(() => { setRetryBusy(false); qc.invalidateQueries({ queryKey: ["order", token] }); });
  };
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
                <section key={c} className="cc-enter rounded-xl border border-border bg-card p-4 shadow-sm">
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
              <section className="cc-enter mt-10 rounded-xl border-2 border-gold bg-card p-6 text-center shadow-sm">
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
          <p className="mt-2 text-sm text-muted-foreground">{order.is_free
            ? "Sua leitura de cortesia não foi consumida. Toque abaixo para tentar novamente."
            : "Seu Pix já foi confirmado. A interpretação ainda não terminou; você não precisa pagar novamente."}</p>
          <Button className="mt-4" disabled={retryBusy} onClick={() => order.is_free ? startFree(true) : retryPaid()}>{retryBusy ? "Tentando…" : order.is_free ? "Tentar novamente" : "Retomar minha interpretação"}</Button>
          {retryError && <p role="alert" className="mt-3 text-sm text-destructive">{retryError}</p>}
        </div>
      ) : order.status === "generating" ? (
        <GeneratingProgress isFree={!!order.is_free} />
      ) : (
        <div className="cc-payment-pulse mt-10 rounded-lg border border-gold bg-card p-6 text-center" role="status">
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
  const offerSection = useRef<HTMLElement | null>(null);
  const track = useConversion();
  useEffect(() => {
    if (!isFree || planId !== "essencial" || !offerSection.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        track("upgrade_view");
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(offerSection.current);
    return () => observer.disconnect();
  }, [isFree, planId]);
  const cat = category && category in OTHER_TOPIC ? category : "Outros assuntos";
  const other = OTHER_TOPIC[cat]!;
  const deeperPlans: PlanId[] = planId === "completa" ? [] : planId === "profunda" ? ["completa"] : ["profunda", "completa"];
  const freeUpgradeOffers = isFree && planId === "essencial" ? getPostFreeUpgradeOffers(cards.length) : [];
  const href = (plano: PlanId | null, categoria: string) =>
    `/?${new URLSearchParams({ ...(plano ? { plano } : {}), categoria }).toString()}`;
  // Expansion keeps the same question and the cards already drawn; the user only picks the missing ones.
  const expandHref = (plano: PlanId) =>
    `/?${new URLSearchParams({ plano, categoria: cat }).toString()}`;
  const keepExpansion = (plano: PlanId, event: MouseEvent<HTMLAnchorElement>) => {
    try {
      sessionStorage.setItem(EXPANSION_KEY, JSON.stringify({ plan: plano, question, cards, at: Date.now() }));
      sessionStorage.setItem(PENDING_UPGRADE_KEY, plano);
      track(plano === "profunda" ? "upgrade_5" : "upgrade_7", plano);
    } catch {
      event.preventDefault();
      toast.error("Não foi possível preservar sua pergunta neste navegador. Tente novamente.");
    }
  };
  return (
    <section ref={offerSection} id="aprofundar" className="cc-enter mt-12 rounded-xl border border-gold/50 bg-card/70 p-5 text-center">
      <p className="text-2xl text-gold">✦</p>
      <h2 className="mt-1 font-display text-2xl font-semibold text-primary">{isFree ? "Sua primeira leitura está completa" : "Continue seu caminho"}</h2>
      <p className="mt-2 text-base text-foreground/90">
        {isFree
          ? "Você já recebeu sua orientação gratuita com 3 cartas. Se quiser explorar a mesma pergunta por outros ângulos, escolha uma tiragem maior. O aprofundamento é opcional."
          : deeperPlans.length
            ? "Se quiser, explore outros aspectos da mesma pergunta em uma tiragem maior. Sua leitura anterior continua salva."
            : "As cartas mostram um momento. Quando quiser, pergunte sobre outra área da sua vida."}
      </p>
      <div className="mt-5 space-y-3">
        {isFree && freeUpgradeOffers.length > 0 ? (
          <>
            <div className="space-y-3 text-left" aria-label="Opções pagas para aprofundar a leitura">
              {freeUpgradeOffers.map((item, i) => (
                <div key={item.plan} className={i === 0 ? "cc-soft-interact rounded-xl border border-gold bg-gold/[0.06] p-4" : "cc-soft-interact rounded-xl border border-border bg-background/40 p-4"}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gold">{item.tag}</span>
                    <span className="font-display text-2xl font-semibold text-primary">{formatBRL(item.priceCents)}</span>
                  </div>
                  <h3 className="mt-2 font-display text-xl font-semibold text-primary">{item.count} cartas — {item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/85">{item.description}</p>
                  <Button asChild size="lg" variant={i === 0 ? "default" : "outline"}
                    className={i === 0 ? "gold-button cc-soft-interact mt-4 h-auto min-h-12 w-full whitespace-normal rounded-xl py-3 text-base" : "cc-soft-interact mt-4 h-auto min-h-12 w-full whitespace-normal rounded-xl border-gold py-3 text-base text-gold"}>
                    <a href={expandHref(item.plan)} onClick={(event) => keepExpansion(item.plan, event)}>
                      Continuar com {item.count} cartas · escolher mais {item.extraCards}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Valores totais das novas consultas, pagos por Pix. As 3 cartas já escolhidas serão aproveitadas e reinterpretadas nas posições da tiragem maior. Você escolhe apenas as cartas restantes. Sua leitura grátis continua salva.
            </p>
          </>
        ) : deeperPlans.map((d, i) => (
          <Button key={d} asChild size="lg" variant={i === 0 ? "default" : "outline"} className={i === 0 ? "gold-button h-auto min-h-14 w-full whitespace-normal rounded-xl py-3 text-base leading-snug" : "h-auto min-h-12 w-full whitespace-normal rounded-xl border-gold py-3 text-base leading-snug text-gold"}>
            <a href={expandHref(d)} onClick={(event) => keepExpansion(d, event)}>✦ Expandir para {PLANS[d].count} cartas · {PLANS[d].name} ({formatBRL(PLANS[d].priceCents)})<span className="block text-sm opacity-80">Aproveite suas {cards.length} cartas e escolha mais {PLANS[d].count - cards.length}</span></a>
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
