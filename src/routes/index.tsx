import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CardBack } from "@/components/TarotCard";
import { CARDS, PLANS, PIX_KEY, PIX_QR_SRC, formatBRL, type PlanId } from "@/lib/lenormand";
import { createOrder } from "@/lib/orders.functions";
import heroTarot from "@/assets/hero-tarot.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cartas de Tarô — Tarô Cigano online" },
      { name: "description", content: "Faça sua pergunta objetiva sobre amor, dinheiro, saúde ou espiritualidade e receba sua leitura de Tarô Cigano." },
      { property: "og:title", content: "Cartas de Tarô — Tarô Cigano online" },
      { property: "og:description", content: "Leituras de Tarô Cigano personalizadas, a partir de R$ 10,90." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PLAN_HINT: Record<PlanId, string> = {
  essencial: "para uma pergunta rápida",
  profunda: "para entender melhor a situação",
  completa: "para uma visão completa",
};

const THEMES = [
  { label: "Amor", example: "Como está minha vida amorosa e o que posso esperar?" },
  { label: "Dinheiro", example: "O que preciso saber sobre minha vida financeira?" },
  { label: "Saúde", example: "O que as cartas mostram sobre meu bem-estar?" },
  { label: "Espiritualidade", example: "Qual mensagem espiritual preciso ouvir agora?" },
];

function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

function Index() {
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [question, setQuestion] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [deck, setDeck] = useState(() => Array.from({ length: CARDS.length }, (_, i) => i));
  const [token, setToken] = useState<string | null>(null);
  const [orderCode, setOrderCode] = useState("");
  const [loading, setLoading] = useState(false);
  const create = useServerFn(createOrder);
  const p = plan ? PLANS[plan] : null;
  const link = useMemo(() => (token && typeof window !== "undefined" ? `${window.location.origin}/leitura/${token}` : ""), [token]);

  const choosePlan = (id: PlanId) => {
    setPlan(id);
    setPicked([]);
    setDeck(shuffle(CARDS.length));
    setTimeout(() => document.getElementById("consulta")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const toggle = (card: number) => {
    if (!p) return;
    setPicked((cur) => (cur.includes(card) ? cur.filter((c) => c !== card) : cur.length < p.count ? [...cur, card] : cur));
  };

  const submit = async () => {
    if (!plan || !p) return;
    setLoading(true);
    try {
      const r = await create({ data: { plan, question, cards: picked } });
      setOrderCode(r.orderCode);
      setToken(r.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const MIN_Q = 10;
  const qLen = question.trim().length;
  const qOk = qLen >= MIN_Q;
  const missing: string[] = [];
  if (p && !qOk) missing.push(`Escrever sua pergunta (mínimo ${MIN_Q} caracteres)`);
  if (p && picked.length < p.count) missing.push(`Escolher mais ${p.count - picked.length} carta(s)`);
  const ready = !!p && missing.length === 0;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20">
      <header className="relative -mx-5 mb-10 overflow-hidden border-b-2 border-gold">
        <img src={heroTarot} alt="Cartas de tarô sobre veludo verde com vela e estrelas douradas" width={1280} height={960} className="h-[460px] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Tarô Cigano · Baralho Cigano</p>
          <h1 className="mt-2 text-5xl font-bold text-primary-foreground">Cartas de Tarô</h1>
          <div className="gold-rule mx-auto mt-4 w-40" />
          <p className="mt-4 text-lg text-primary-foreground/90">Faça sua pergunta objetiva: amor, dinheiro, saúde, espiritualidade.</p>
        </div>
      </header>

      <StepHeader n={1} title="Escolha sua consulta" hint="Toque em uma das opções abaixo." />
      <section className="space-y-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const pl = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              onClick={() => choosePlan(id)}
              className={`flex w-full items-center justify-between gap-4 rounded-xl border-2 p-5 text-left shadow-sm transition-all ${active ? "border-gold bg-primary text-primary-foreground shadow-lg" : "border-border bg-card hover:border-gold"}`}
            >
              <div className="min-w-0">
                <h3 className="font-display text-2xl font-semibold leading-tight">{pl.name}</h3>
                <p className={`mt-1 text-sm ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{pl.count} cartas · {PLAN_HINT[id]}</p>
              </div>
              <span className="shrink-0 font-display text-2xl font-bold text-gold">{formatBRL(pl.priceCents)}</span>
            </button>
          );
        })}
      </section>

      {p && (
        <section id="consulta" className="mt-14 space-y-14">
          <div>
            <StepHeader n={2} title="Escreva sua pergunta" hint="Toque em um tema para ver um exemplo, ou escreva com suas palavras." />
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setQuestion(t.example)}
                    className="rounded-full border border-gold/70 bg-background px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                id="pergunta"
                className={`mt-4 min-h-28 bg-background text-base ${qOk ? "" : "border-destructive"}`}
                maxLength={1000}
                placeholder="Ex.: O que preciso saber sobre minha vida profissional nos próximos meses?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <p className={`mt-2 text-sm ${qOk ? "text-primary" : "text-destructive"}`}>
                {qOk ? "Pergunta pronta ✓" : `Mínimo de ${MIN_Q} caracteres (${qLen}/${MIN_Q})`}
              </p>
            </div>
          </div>
          <div>
            <StepHeader n={3} title="Escolha suas cartas" hint={`Pense na sua pergunta e toque em ${p.count} cartas.`} />
            <div className="relative rounded-2xl border border-gold/50 bg-card p-5 shadow-md outline outline-1 outline-offset-4 outline-gold/30">
              <div className="mb-5 text-center">
                <p className="font-display text-sm tracking-[0.3em] text-gold">✦ ✦ ✦</p>
                <p className="mt-1 font-display text-2xl text-primary">
                  Você já escolheu <span className="font-bold text-gold">{picked.length}</span> de {p.count}
                </p>
                <p className="text-sm text-muted-foreground">Toque nas cartas para escolher</p>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {deck.map((card) => {
                  const idx = picked.indexOf(card);
                  return (
                    <button key={card} onClick={() => toggle(card)} aria-label="Escolher carta" className="rounded-md transition-transform hover:-translate-y-1">
                      <CardBack selected={idx >= 0} order={idx >= 0 ? idx + 1 : undefined} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-5 text-center font-display text-sm tracking-[0.3em] text-gold">✦</p>
            </div>
          </div>
          <div className="space-y-4">
            {missing.length > 0 && (
              <div className="rounded-xl border border-destructive/60 bg-card p-4 text-sm text-destructive">
                <p className="font-semibold">Para continuar, falta:</p>
                <ul className="mt-1 list-disc pl-5">
                  {missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
            <Button size="lg" className="h-14 w-full rounded-xl text-lg shadow-lg" disabled={loading} onClick={ready ? submit : () => { if (!qOk) document.getElementById("pergunta")?.focus(); }}>
              {loading ? "Criando pedido..." : `Pagar ${formatBRL(p.priceCents)} via Pix`}
            </Button>
          </div>
        </section>
      )}

      <Dialog open={!!token} onOpenChange={(o) => !o && setToken(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl text-primary">Pagamento via Pix</DialogTitle>
            <DialogDescription>Valor: <strong className="text-foreground">{p && formatBRL(p.priceCents)}</strong></DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-md border border-gold bg-card px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">Número do pedido</p>
              <p className="font-mono text-xl font-bold tracking-widest text-primary">{orderCode}</p>
            </div>
            <Button variant="outline" onClick={() => copy(orderCode, "Número do pedido")}>Copiar</Button>
          </div>
          <img src={PIX_QR_SRC} alt="QR Code Pix" className="mx-auto aspect-square w-52 rounded-md border border-border bg-card object-contain" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Chave Pix</p>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">{PIX_KEY}</code>
              <Button variant="outline" onClick={() => copy(PIX_KEY, "Chave Pix")}>Copiar</Button>
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Abra o app do seu banco e pague o valor exato via Pix.</li>
            <li>Na descrição do Pix, escreva o número do pedido: <strong className="text-foreground">{orderCode}</strong>.</li>
            <li>Guarde o link abaixo: é por ele que você verá sua leitura.</li>
            <li>Após confirmarmos o pagamento, sua leitura aparecerá nesse link.</li>
          </ol>
          <div className="space-y-2 rounded-md border border-gold p-3">
            <p className="text-sm font-medium">Sua página de leitura</p>
            <Button asChild className="w-full">
              <a href={link}>Abrir minha página de leitura</a>
            </Button>
            <button className="w-full text-xs text-muted-foreground underline" onClick={() => copy(link, "Link")}>Copiar link para guardar</button>
          </div>
        </DialogContent>
      </Dialog>
      <footer className="mt-24 space-y-2 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
        <p>Tiragens para reflexão e autoconhecimento. Não substituem orientação médica, jurídica ou financeira.</p>
        <p>© {new Date().getFullYear()} Cartas de Tarô · Todos os direitos reservados.</p>
        <a href="/admin" className="inline-block text-muted-foreground/60 hover:underline">Acesso administrativo</a>
      </footer>
    </main>
  );
}

function StepHeader({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-primary font-display text-xl font-bold text-gold">{n}</span>
      <div>
        <h2 className="font-display text-3xl font-semibold leading-tight text-primary">{title}</h2>
        <p className="mt-1 text-base text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
