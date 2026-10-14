import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CardFace } from "@/components/TarotCard";
import { PLANS, type PlanId } from "@/lib/lenormand";
import { getOrderByToken } from "@/lib/orders.functions";

const orderQuery = (token: string) =>
  queryOptions({
    queryKey: ["order", token],
    queryFn: () => getOrderByToken({ data: { token } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "done" || s === "rejected" ? false : 5000;
    },
    refetchIntervalInBackground: false,
  });

export const Route = createFileRoute("/leitura/$token")({
  head: () => ({
    meta: [
      { title: "Sua leitura — Entre Cartas" },
      { name: "description", content: "Sua leitura privada de Baralho Cigano." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sua leitura — Entre Cartas" },
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
  if (!order) return <Missing />;
  const plan = PLANS[order.plan as PlanId];

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-12">
      <p className="text-center text-xs uppercase tracking-[0.3em] text-gold">Entre Cartas · {plan.name}</p>
      <h1 className="mt-3 text-center text-4xl font-bold text-primary">Sua leitura</h1>
      <div className="gold-rule mx-auto mt-5 w-40" />
      <blockquote className="mt-8 rounded-lg border border-border bg-card p-4 font-display text-xl italic">“{order.question}”</blockquote>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {(order.cards as number[]).map((c, i) => <CardFace key={c} index={c} position={plan.positions[i]} />)}
      </div>
      {order.status === "done" && order.reading ? (
        <article className="mt-10 space-y-4 whitespace-pre-line leading-relaxed">{order.reading}</article>
      ) : order.status === "rejected" ? (
        <div className="mt-10 rounded-lg border border-destructive bg-card p-6 text-center">
          <p className="font-display text-2xl text-destructive">Pedido não aprovado</p>
          <p className="mt-2 text-sm text-muted-foreground">Não conseguimos confirmar o pagamento deste pedido. Se você pagou, entre em contato informando o número do pedido.</p>
        </div>
      ) : order.status === "generating" ? (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary animate-pulse">Pagamento aprovado! Interpretando suas cartas…</p>
          <p className="mt-2 text-sm text-muted-foreground">Sua leitura aparecerá aqui em instantes. Não feche esta página.</p>
        </div>
      ) : (
        <div className="mt-10 rounded-lg border border-gold bg-card p-6 text-center">
          <p className="font-display text-2xl text-primary">Aguardando confirmação do pagamento</p>
          <p className="mt-2 text-sm text-muted-foreground">Assim que seu Pix for confirmado, sua leitura aparecerá aqui automaticamente. Deixe esta página aberta.</p>
        </div>
      )}
    </main>
  );
}
