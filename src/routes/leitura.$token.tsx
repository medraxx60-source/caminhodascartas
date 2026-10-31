import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardFace, cardImage } from "@/components/TarotCard";
import { CARDS, PLANS, type PlanId } from "@/lib/lenormand";
import { layoutReading } from "@/lib/reading-layout";
import { getOrderByToken, runFreeGeneration } from "@/lib/orders.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  "Conectando às suas cartas…",
  "Alinhando as posições…",
  "Relacionando as cartas com a sua pergunta…",
  "Redigindo a interpretação…",
  "Recebendo o Conselho dos Anjos…",
];

function GeneratingProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const step = Math.min(PROGRESS_STEPS.length - 1, Math.floor(elapsed / 4));
  // Avança rápido no início e desacelera perto do fim, sem chegar a 100%.
  const pct = Math.round(95 * (1 - Math.exp(-elapsed / 10)));
  return (
    <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
      <p className="font-display text-2xl text-primary">Pagamento aprovado! Interpretando suas cartas…</p>
      <div className="mx-auto mt-5 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gold transition-all duration-1000 ease-out" style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
      <ol className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
        {PROGRESS_STEPS.map((label, i) => (
          <li key={label} className={i < step ? "text-muted-foreground" : i === step ? "font-semibold text-primary animate-pulse" : "text-muted-foreground/50"}>
            {i < step ? "✓" : i === step ? "✦" : "○"} {i + 1}. {label}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">Sua leitura aparecerá aqui em instantes. Não feche esta página.</p>
    </div>
  );
}

export const Route = createFileRoute("/leitura/$token")({
  head: () => ({
    meta: [
      { title: "Sua leitura — EntreCarta.tarô" },
      { name: "description", content: "Sua leitura privada de Baralho Cigano." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sua leitura — EntreCarta.tarô" },
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
  const qc = useQueryClient();
  const [started, setStarted] = useState(false);
  const startFree = () => {
    setStarted(true);
    runFree({ data: { token } }).catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ["order", token] }));
    setTimeout(() => qc.invalidateQueries({ queryKey: ["order", token] }), 800);
  };
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
  if (!order) return <Missing />;
  const plan = PLANS[order.plan as PlanId];

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold">← Voltar ao início</Link>
      <p className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-gold">Entre Cartas · {plan.name}</p>
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
                <h2 className="text-center font-display text-2xl font-semibold text-primary">Conclusão da leitura</h2>
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
                <Button variant="outline" className="mt-5" onClick={() => { navigator.clipboard.writeText(`✦ Conselho dos Anjos ✦\n\n${angels.trim()}\n\n— EntreCarta.tarô ${window.location.origin}`); toast.success("Conselho copiado"); }}>
                  Copiar conselho
                </Button>
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
        <GeneratingProgress />
      ) : order.status === "error" ? (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary">Não conseguimos concluir sua leitura agora</p>
          <p className="mt-2 text-sm text-muted-foreground">Sua leitura de cortesia não foi consumida. Toque abaixo para tentar novamente.</p>
          <Button className="mt-4" onClick={startFree}>Tentar novamente</Button>
        </div>
      ) : order.status === "generating" ? (
        <GeneratingProgress />
      ) : (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary">Aguardando confirmação do pagamento</p>
          <p className="mt-2 text-sm text-muted-foreground">Assim que seu Pix for confirmado, sua leitura aparecerá aqui automaticamente. Deixe esta página aberta.</p>
        </div>
      )}
      <div className="mt-12 rounded-xl border border-gold/50 bg-card/70 p-5 text-center">
        {order.status === "done" && plan.count < 7 && (
          <p className="mb-3 text-base text-foreground">Quer aprofundar essa resposta? Uma tiragem de {plan.count < 5 ? "5 ou 7" : "7"} cartas mostra mais detalhes da sua situação.</p>
        )}
        <Button asChild size="lg" className="gold-button h-14 w-full rounded-xl text-lg">
          <Link to="/">Fazer nova consulta</Link>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Esta leitura fica salva em “Minhas leituras”, no menu ☰ da tela inicial.</p>
      </div>
    </main>
  );
}
