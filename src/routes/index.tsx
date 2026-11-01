import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { CardBack, CardReveal, preloadCardImages } from "@/components/TarotCard";
import { CARDS, PLANS, PIX_KEY, PIX_QR_SRC, formatBRL, type PlanId , CATEGORIES, type Category } from "@/lib/lenormand";
import { createOrder, getOrderStatus, checkFreeReading, createFreeOrder } from "@/lib/orders.functions";
import heroTarot from "@/assets/hero-tarot.jpg";
import cardBackSrc from "@/assets/card-back.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EntreCarta.tarô — Tarô Cigano online" },
      { name: "description", content: "Faça sua pergunta objetiva sobre amor, dinheiro, saúde ou espiritualidade e receba sua leitura de Tarô Cigano." },
      { property: "og:title", content: "EntreCarta.tarô — Tarô Cigano online" },
      { property: "og:description", content: "Leituras de Tarô Cigano personalizadas, a partir de R$ 4,90." },
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

const QUESTION_SUGGESTIONS: Record<string, string[]> = {
  "Amor e relacionamentos": ["Como estão as energias entre mim e essa pessoa?", "O que esperar da minha vida amorosa nos próximos meses?"],
  "Trabalho e carreira": ["O que esperar do meu trabalho nos próximos meses?", "Devo mudar de emprego agora?"],
  "Dinheiro e prosperidade": ["Como vai ficar minha vida financeira nos próximos meses?", "O que está travando minha prosperidade?"],
  "Família e vida pessoal": ["Como melhorar a relação com minha família?", "O que preciso entender sobre este momento da minha vida?"],
  "Espiritualidade e autoconhecimento": ["Qual mensagem espiritual preciso receber agora?", "O que preciso desenvolver em mim neste momento?"],
  "Saúde e bem-estar": ["Como cuidar melhor da minha energia e bem-estar?", "O que está pesando no meu emocional?"],
  "Outros assuntos": ["O que preciso saber sobre a situação que estou vivendo?", "Qual caminho devo seguir agora?"],
};


function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

const PENDING_KEY = "entre_cartas_pending_order";

function Index() {
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [step, setStep] = useState(0);
  const [ritualDone, setRitualDone] = useState(false);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [deck, setDeck] = useState(() => Array.from({ length: CARDS.length }, (_, i) => i));
  const [token, setToken] = useState<string | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [orderCode, setOrderCode] = useState("");
  const [pixCode, setPixCode] = useState<{ payload: string; image: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const create = useServerFn(createOrder);
  const p = plan ? PLANS[plan] : null;
  const link = useMemo(() => (token && typeof window !== "undefined" ? `${window.location.origin}/leitura/${token}` : ""), [token]);
  const checkStatus = useServerFn(getOrderStatus);
  useEffect(() => { const b = new Image(); b.src = cardBackSrc; }, []);
  useEffect(() => { if (plan) preloadCardImages(); }, [plan]);
  const checkFree = useServerFn(checkFreeReading);
  const createFree = useServerFn(createFreeOrder);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [free, setFree] = useState<{ enabled: boolean; eligible: boolean } | null>(null);
  const [myReadings, setMyReadings] = useState<{ token: string; at: string; plan: string }[]>([]);
  useEffect(() => {
    try { setMyReadings(JSON.parse(localStorage.getItem("entre_cartas_readings") || "[]")); } catch {}
  }, []);
  // Restore an unpaid Pix order if the phone reloaded the page while the user was in the bank app.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (s?.token && Date.now() - (s.at ?? 0) < 24 * 60 * 60 * 1000) {
        if (s.plan && s.plan in PLANS) setPlan(s.plan);
        if (s.category) setCategory(s.category);
        if (s.question) setQuestion(s.question);
        if (Array.isArray(s.cards) && s.cards.length) { setPicked(s.cards); setRitualDone(true); setStep(2); }
        setOrderCode(s.orderCode ?? "");
        setToken(s.token);
        setPixOpen(true);
      } else if (s) localStorage.removeItem(PENDING_KEY);
    } catch {}
  }, []);
  useEffect(() => {
    let id = localStorage.getItem("entre_cartas_device_id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem("entre_cartas_device_id", id); }
    setDeviceId(id);
    checkFree({ data: { deviceId: id } }).then(setFree).catch(() => setFree(null));
  }, [checkFree]);
  const isFreePlan = (id: PlanId) => id === "essencial" && !!free?.enabled && !!free?.eligible;
  const priceLabel = (id: PlanId) => (isFreePlan(id) ? "Grátis" : formatBRL(PLANS[id].priceCents));
  const [nudged, setNudged] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!token) return;
    setNudged(false); setSlow(false);
    const t = setTimeout(() => setSlow(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await checkStatus({ data: { token } });
        if (!stop && r.status && r.status !== "pending") { stop = true; try { localStorage.removeItem(PENDING_KEY); } catch {} window.location.href = `/leitura/${token}`; return; }
        if (!stop && r.nudgedAt) setNudged(true);
        if (!stop && r.pixPayload) setPixCode((c) => c ?? { payload: r.pixPayload!, image: r.pixImage });
      } catch { /* tenta de novo */ }
    };
    const id = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(id); };
  }, [token, checkStatus]);

  const choosePlan = (id: PlanId) => {
    if (id !== plan) {
      setPicked([]); setDeck(shuffle(CARDS.length));
      if (token) { setToken(null); setOrderCode(""); try { localStorage.removeItem(PENDING_KEY); } catch {} }
    }
    setPlan(id);
  };

  // Picks are final: a chosen card can never be un-flipped.
  const toggle = (card: number) => {
    if (!p) return;
    setPicked((cur) => (cur.includes(card) || cur.length >= p.count ? cur : [...cur, card]));
  };

  const restart = () => {
    setToken(null); setOrderCode(""); setPixOpen(false);
    try { localStorage.removeItem(PENDING_KEY); } catch {}
    setPicked([]); setDeck(shuffle(CARDS.length)); setQuestion(""); setCategory(null); setRitualDone(false);
    goStep(0);
  };

  const submit = async () => {
    if (!plan || !p) return;
    // Reuse the existing unpaid order instead of creating a duplicate.
    if (token) { setPixOpen(true); return; }
    setLoading(true);
    try {
      if (isFreePlan(plan) && deviceId) {
        const r = await createFree({ data: { deviceId, category: category ?? "Outros assuntos", question, cards: picked } });
        window.location.href = `/leitura/${r.token}`;
        return;
      }
      const r = await create({ data: { plan, category: category ?? "Outros assuntos", question, cards: picked } });
      setOrderCode(r.orderCode);
      setPixCode(r.pixPayload ? { payload: r.pixPayload, image: r.pixImage } : null);
      setToken(r.token);
      setPixOpen(true);
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ token: r.token, orderCode: r.orderCode, plan, category, question, cards: picked, at: Date.now() })); } catch {}
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
  const qOk = qLen >= MIN_Q && !!category;
  const missing: string[] = [];
  if (p && !qOk) missing.push(`Escrever sua pergunta (mínimo ${MIN_Q} caracteres)`);
  if (p && picked.length < p.count) missing.push(`Escolher mais ${p.count - picked.length} carta(s)`);
  const ready = !!p && missing.length === 0;

  const goStep = (s: number) => { setStep(s); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="mystic min-h-screen">
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20">
      {step > 0 && (
        <div className="flex items-center gap-3 pt-5">
          <button onClick={() => goStep(step - 1)} aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-card text-gold text-xl">‹</button>
          <p className="flex-1 text-center font-display text-xl text-foreground">Cartas de Tarô</p>
          <span className="w-11 text-right text-xs text-muted-foreground">{step + 1}/3</span>
        </div>
      )}

      {step === 0 && (<>
      <header className="relative -mx-5 mb-10 overflow-hidden">
        <img src={heroTarot} alt="Cartas de tarô sobre veludo verde com vela e estrelas douradas" width={1280} height={960} className="h-[340px] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Tarô Cigano · Baralho Cigano</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground">Cartas de Tarô</h1>
          <div className="gold-rule mx-auto mt-3 w-40" />
          <p className="mt-3 text-base text-foreground/90">Faça sua pergunta e receba sua leitura: amor, dinheiro, saúde, espiritualidade.</p>
        </div>
      </header>

      <Sheet>
        <SheetTrigger asChild>
          <button aria-label="Abrir menu" className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-card/90 text-gold backdrop-blur">
            <Menu className="h-5 w-5" />
            {myReadings.length > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />}
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="mystic w-[85vw] max-w-sm border-gold/40 bg-background">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl text-gold">EntreCarta.tarô</SheetTitle>
          </SheetHeader>
          <div className="gold-rule my-4" />
          <p className="font-display text-lg text-gold">Minhas leituras</p>
          <div className="mt-3 space-y-2">
            {myReadings.length === 0 && <p className="text-sm text-muted-foreground">Suas consultas anteriores aparecerão aqui.</p>}
            {myReadings.map((r) => (
              <a key={r.token} href={`/leitura/${r.token}`} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground">
                <span>{PLANS[r.plan as PlanId]?.name ?? "Leitura"} · {new Date(r.at).toLocaleDateString("pt-BR")}</span>
                <span className="text-gold">Abrir ›</span>
              </a>
            ))}
          </div>
          <div className="gold-rule my-6" />
          <a href="https://wa.me/5563991167896?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20no%20Cartas%20de%20Tar%C3%B4." target="_blank" rel="noreferrer" className="block rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground">Ajuda pelo WhatsApp <span className="float-right text-gold">›</span></a>
        </SheetContent>
      </Sheet>

      <StepHeader n={1} title="Escolha sua consulta" hint="Toque em uma das opções abaixo." />
      <section className="space-y-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const pl = PLANS[id];
          const active = plan === id;
          return (
            <button
              key={id}
              onClick={() => choosePlan(id)}
              className={`flex w-full items-center justify-between gap-4 rounded-xl border-2 p-5 text-left shadow-sm transition-all ${active ? "border-gold bg-secondary shadow-[0_0_30px_-8px] shadow-gold" : "border-border bg-card hover:border-gold"}`}
            >
              <div className="min-w-0">
                {isFreePlan(id) && <span className="mb-1 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">1ª Tiragem Gratuita</span>}
                {id === "profunda" && <span className="mb-1 inline-block rounded-full border border-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">✦ Mais escolhida</span>}
                <h3 className="font-display text-2xl font-semibold leading-tight">{pl.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{pl.count} cartas · {PLAN_HINT[id]}</p>
              </div>
              <span className="shrink-0 font-display text-2xl font-bold text-gold">{priceLabel(id)}</span>
            </button>
          );
        })}
      </section>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>🔒 Consulta privada</span><span>⚡ Resposta na hora</span><span>✦ Baralho Cigano tradicional</span>
      </div>
      {free?.enabled && !free.eligible && (
        <p className="mt-4 rounded-xl border border-gold/40 bg-card/70 p-4 text-center text-sm text-muted-foreground">Você já aproveitou sua 1ª leitura de cortesia ✦ As tiragens de 5 e 7 cartas trazem uma visão ainda mais completa da sua situação.</p>
      )}
      <Button size="lg" className="gold-button mt-8 h-14 w-full rounded-xl text-lg" disabled={!p} onClick={() => goStep(1)}>
        {p ? `Continuar com ${p.name}` : "Escolha uma consulta acima"}
      </Button>
      </>)}

      {p && step === 1 && (
        <section className="mt-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold text-foreground">Sobre o que é sua consulta?</h2>
            <p className="mt-2 text-muted-foreground">Escolha o assunto da sua consulta.</p>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${category === c ? "border-gold bg-gold text-background shadow-lg" : "border-gold/70 bg-background text-gold hover:bg-gold hover:text-background"}`}>
                  {c}
                </button>
              ))}
            </div>
            {category && (<>
              <h3 className="mt-6 font-display text-2xl font-semibold text-foreground">Qual é a sua pergunta?</h3>
              <p className="mt-1 text-sm text-muted-foreground">Conte o que você gostaria de saber. Escreva com suas próprias palavras e receba uma leitura direcionada à sua situação.</p>
              <Textarea id="pergunta" className="mt-4 min-h-32 bg-background text-base" maxLength={1000}
                value={question} onChange={(e) => setQuestion(e.target.value)}
                onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }} />
              {!question.trim() && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Sem ideias? Toque em uma sugestão:</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {(QUESTION_SUGGESTIONS[category] ?? QUESTION_SUGGESTIONS["Outros assuntos"]!).map((s) => (
                      <button key={s} type="button" onClick={() => setQuestion(s)} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-sm text-muted-foreground hover:border-gold hover:text-foreground">“{s}”</button>
                    ))}
                  </div>
                </div>
              )}
            </>)}
            <p className={`mt-2 text-sm ${qOk ? "text-gold" : category && qLen > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {!category ? "Escolha um assunto acima" : qOk ? "Sua pergunta está pronta ✓ Vamos às cartas." : `Mínimo de ${MIN_Q} caracteres (${qLen}/${MIN_Q})`}
            </p>
          </div>
          <Button size="lg" className="gold-button mt-8 h-14 w-full rounded-xl text-lg"
            onClick={() => (qOk ? goStep(2) : document.getElementById("pergunta")?.focus())}>
            {qOk ? "Escolher minhas cartas" : !category ? "Escolha um assunto para continuar" : "Escreva sua pergunta para continuar"}
          </Button>
        </section>
      )}

      {p && step === 2 && !ritualDone && (
        <section className="mt-10 animate-in fade-in duration-1000 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/50 text-4xl text-gold shadow-[0_0_40px_-10px] shadow-gold animate-pulse [animation-duration:4s]">☾</div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-gold">✦ Momento de conexão ✦</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-foreground">Antes de abrir suas cartas…</h2>
          <div className="gold-rule mx-auto mt-4 w-32" />
          <div className="mt-6 space-y-3 text-lg leading-relaxed text-foreground/90">
            <p>Respire fundo e acalme seus pensamentos.</p>
            <p>Mentalize com fé a pergunta que trouxe você até aqui.</p>
          </div>
          {question.trim() && (
            <div className="mt-6 rounded-2xl border border-gold/50 bg-card/70 p-6 shadow-[0_0_40px_-15px] shadow-gold">
              <p className="text-xs uppercase tracking-[0.25em] text-gold">Sua pergunta</p>
              <p className="mt-2 font-display text-2xl italic text-foreground">“{question.trim()}”</p>
            </div>
          )}
          <p className="mt-5 text-sm text-muted-foreground">Não tenha pressa. Quando sentir, abra suas cartas.</p>
          <Button size="lg" className="gold-button mt-8 h-14 w-full rounded-xl text-lg" onClick={() => { setRitualDone(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Estou pronto(a), abrir minhas cartas
          </Button>
        </section>
      )}

      {p && step === 2 && ritualDone && (
        <section className="mt-6">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold text-foreground">Escolha {p.count} cartas</h2>
            <p className="mx-auto mt-2 max-w-xs text-muted-foreground">Deslize o dedo para os lados e toque na carta do centro que sentir.</p>
          </div>
          <CardCarousel deck={deck} picked={picked} onPick={toggle} />
          <p className="mb-3 text-center text-sm font-semibold text-gold" aria-live="polite">
            {picked.length < p.count ? `Cartas escolhidas: ${picked.length} de ${p.count}` : "✦ Sua tiragem está completa ✦"}
          </p>
          <div className="flex justify-center gap-2">
            {Array.from({ length: p.count }, (_, i) => {
              const filled = picked[i] !== undefined;
              return (
                <button key={i} type="button" disabled
                  aria-label={filled ? `Carta ${i + 1} escolhida` : `Espaço ${i + 1}`}
                  className={`flex h-12 w-10 items-center justify-center rounded-md border font-display text-lg font-bold shadow-inner transition-all ${filled ? "border-gold bg-gold text-background shadow-lg" : "border-gold/40 bg-secondary text-foreground/80"}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          {picked.length > 0 && !token && (
            <button type="button" disabled={loading}
              onClick={() => { setPicked([]); setDeck(shuffle(CARDS.length)); }}
              className="mx-auto mt-3 block text-sm text-gold underline-offset-4 hover:underline">
              ↻ Embaralhar e escolher novamente
            </button>
          )}
          <Button size="lg" className={`gold-button mt-8 h-14 w-full rounded-xl text-lg ${picked.length === p.count && !loading ? "animate-pulse [animation-duration:2.5s]" : ""}`} disabled={loading || picked.length < p.count} onClick={submit}>
            {loading ? "Preparando sua leitura..." : picked.length < p.count ? `Escolha mais ${p.count - picked.length} carta(s)` : token ? `Continuar pagamento · Pedido ${orderCode}` : `Ver interpretação · ${plan ? priceLabel(plan) : ""}`}
          </Button>
        </section>
      )}

      {/* Payment screen is locked: it only leaves when the admin approves and we redirect to the reading. */}
      <Dialog open={!!token} onOpenChange={() => {}}>
        <DialogContent className="mystic max-h-[90vh] overflow-y-auto pb-20 sm:pb-6 [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display text-3xl text-primary">Finalize seu pagamento</DialogTitle>
            <DialogDescription>Falta pouco para acessar sua leitura.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-gold bg-card p-4 text-center">
            <p className="text-sm text-muted-foreground">{p && `${p.name} · ${p.count} cartas`}</p>
            <p className="font-display text-5xl font-bold text-primary">{p && formatBRL(p.priceCents)}</p>
            <p className="mt-1 text-xs text-destructive">Pague exatamente este valor para sua leitura ser liberada.</p>
          </div>
          {pixCode ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-foreground">
                {["Copie o código Pix", "Pague no app do banco (Pix Copia e Cola)", "Volte aqui: sua leitura abre sozinha"].map((t, i) => (
                  <div key={t} className="rounded-lg border border-gold/40 bg-card p-2">
                    <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-gold font-bold text-background">{i + 1}</span>
                    {t}
                  </div>
                ))}
              </div>
              <Button size="lg" className="gold-button h-14 w-full rounded-xl text-lg" onClick={() => { copy(pixCode.payload, "Código Pix"); try { navigator.vibrate?.(60); } catch {} }}>
                Copiar código Pix
              </Button>
              <code className="block max-h-20 overflow-y-auto break-all rounded-md bg-muted px-3 py-2 text-center text-[11px]">{pixCode.payload}</code>
              {pixCode.image && <img src={`data:image/png;base64,${pixCode.image}`} alt="QR Code Pix" className="mx-auto aspect-square w-48 rounded-md border border-gold bg-white p-1 object-contain" />}
              <p className="text-center text-sm text-muted-foreground">O valor de <strong className="text-foreground">{p && formatBRL(p.priceCents)}</strong> já vem preenchido. É só confirmar no banco.</p>
              <p className="rounded-md border border-border bg-card/70 p-3 text-center text-sm text-muted-foreground">🔒 Pode sair para o app do banco tranquilo(a): seu pedido e suas cartas ficam guardados e esta tela volta igual.</p>
            </>
          ) : (
            <>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-foreground">
              {["Copie a chave Pix", "Pague no app do banco", "Volte aqui para sua leitura"].map((t, i) => (
                <div key={t} className="rounded-lg border border-gold/40 bg-card p-2">
                  <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-gold font-bold text-background">{i + 1}</span>
                  {t}
                </div>
              ))}
            </div>
            <Button size="lg" className="gold-button h-14 w-full rounded-xl text-lg" onClick={() => { copy(PIX_KEY, "Chave Pix"); try { navigator.vibrate?.(60); } catch {} }}>
              Copiar chave Pix
            </Button>
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-center text-xs">{PIX_KEY}</code>
            <img src={PIX_QR_SRC} alt="QR Code Pix" className="mx-auto aspect-square w-48 rounded-md border border-gold bg-card p-1 object-contain" />
            <p className="text-center text-sm text-muted-foreground">Digite o valor <strong className="text-foreground">{p && formatBRL(p.priceCents)}</strong> no app do banco e confirme.</p>
            <p className="rounded-md border border-border bg-card/70 p-3 text-center text-sm text-muted-foreground">🔒 Pode sair para o app do banco tranquilo(a): seu pedido e suas cartas ficam guardados e esta tela volta igual.</p>
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
              <p className="text-sm">Na descrição do Pix, informe: <span className="font-mono font-bold tracking-widest text-primary">{orderCode}</span></p>
              <Button size="sm" variant="outline" onClick={() => copy(orderCode, "Número do pedido")}>Copiar</Button>
            </div>
            </>
          )}
          <div className="space-y-2 border-t border-border pt-3 text-center">
            {nudged ? (
              <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm font-semibold text-foreground">Atenção: conferimos e o seu Pix ainda não foi identificado. Verifique no app do seu banco se a transferência foi concluída com o valor correto.</p>
            ) : slow ? (
              <p role="status" className="rounded-md border border-gold bg-gold/10 p-3 text-sm text-foreground">Ainda não identificamos a sua transferência. Abra o app do seu banco, cole a chave Pix e confirme o pagamento para iniciar a sua interpretação.</p>
            ) : null}
            <p role="status" className="flex items-start justify-center gap-3 rounded-md border border-gold/60 bg-gold/10 p-4 text-left text-base font-semibold leading-relaxed text-foreground"><span className="mt-2 inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-gold" />Aguardando confirmação do pagamento… você será levado(a) à sua leitura automaticamente.</p>
          </div>
        </DialogContent>
      </Dialog>
      <footer className="mt-24 space-y-2 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
        <p>Tiragens para reflexão e autoconhecimento. Não substituem orientação médica, jurídica ou financeira.</p>
        <p>© {new Date().getFullYear()} Cartas de Tarô · Todos os direitos reservados.</p>
        <a href="/admin" className="inline-block text-muted-foreground/60 hover:underline">Acesso administrativo</a>
      </footer>
      <a
        href={`https://wa.me/5563991167896?text=${encodeURIComponent(orderCode ? `Olá! Preciso de ajuda com o pedido ${orderCode} no Cartas de Tarô.` : "Olá! Preciso de ajuda no Cartas de Tarô.")}`}
        target="_blank" rel="noopener noreferrer" aria-label="Precisa de ajuda? Falar no WhatsApp"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        className="fixed right-3 z-[60] flex items-center gap-1.5 rounded-full border border-gold bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground shadow-md"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.2.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"/></svg>
        <span className="sm:hidden">Ajuda</span><span className="hidden sm:inline">Precisa de ajuda?</span>
      </a>
    </main>
    </div>
  );
}

function StepHeader({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-card font-display text-xl font-bold text-gold">{n}</span>
      <div>
        <h2 className="font-display text-3xl font-semibold leading-tight text-primary">{title}</h2>
        <p className="mt-1 text-base text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function CardCarousel({ deck, picked, onPick }: { deck: number[]; picked: number[]; onPick: (c: number) => void }) {
  // Infinite: `cur` is an unbounded integer; positions are computed modulo deck length.
  const [cur, setCur] = useState(Math.floor(deck.length / 2));
  const [startX, setStartX] = useState<number | null>(null);
  const [drag, setDrag] = useState(0); // live drag offset in "cards"
  const STEP = 70;
  const n = deck.length;
  const go = (d: number) => setCur((c) => c + d);
  const curMod = ((cur % n) + n) % n;
  const dragging = startX !== null;
  const pos = (o: number) => {
    const a = Math.abs(o);
    const x = a <= 1 ? o * STEP : Math.sign(o) * (STEP + (a - 1) * 28);
    return x;
  };
  return (
    <div className="mt-6 select-none">
      <div
        className="relative mx-auto h-[360px] w-full touch-pan-y overflow-hidden"
        onTouchStart={(e) => { setStartX(e.touches[0]!.clientX); setDrag(0); }}
        onTouchMove={(e) => {
          if (startX === null) return;
          setDrag(Math.max(-2.5, Math.min(2.5, (e.touches[0]!.clientX - startX) / STEP)));
        }}
        onTouchEnd={() => {
          if (startX === null) return;
          const steps = Math.round(drag) || (Math.abs(drag) > 0.4 ? Math.sign(drag) : 0);
          if (steps) go(-steps);
          setDrag(0);
          setStartX(null);
        }}
      >
        {deck.map((card, i) => {
          let off = (((i - curMod) % n) + n) % n;
          if (off > n / 2) off -= n;
          if (Math.abs(off) > 4) return null;
          const o = off + drag;
          const a = Math.abs(o);
          const idx = picked.indexOf(card);
          const center = off === 0;
          const scale = 1 - Math.min(a, 3) * 0.1;
          const x = pos(o);
          const edge = Math.abs(off) >= 4;
          return (
            <button
              key={card}
              aria-label={center ? (idx >= 0 ? "Carta já escolhida" : "Escolher esta carta") : "Ver esta carta"}
              onClick={() => (center ? idx < 0 && onPick(card) : go(off))}
              style={{
                transform: `translate3d(calc(-50% + ${x}px), calc(-50% + ${Math.min(a, 3) * 6}px), 0) rotate(${Math.max(-3, Math.min(3, o)) * 2.5}deg) scale(${scale})`,
                zIndex: 10 - Math.round(a),
                opacity: a >= 3 ? Math.max(0, 1 - (a - 2.5)) : 1,
                filter: `brightness(${1 - Math.min(a, 1) * 0.25})`,
                transition: dragging || edge ? "none" : "transform 650ms cubic-bezier(0.16,1,0.3,1), opacity 650ms cubic-bezier(0.16,1,0.3,1), filter 650ms cubic-bezier(0.16,1,0.3,1)",
                willChange: "transform",
              }}
              className={`absolute left-1/2 top-1/2 w-52 rounded-2xl ${center ? "shadow-xl" : ""}`}
            >
              <div style={{ perspective: 1000 }}>
                <div className="relative transition-transform duration-700 [transform-style:preserve-3d]" style={{ transform: idx >= 0 ? "rotateY(180deg)" : "none" }}>
                  <div className="[backface-visibility:hidden]"><CardBack /></div>
                  <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    {(idx >= 0 || Math.abs(off) <= 2) && <CardReveal index={card} order={Math.max(idx, 0) + 1} />}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 mb-5 flex justify-center gap-6 text-sm text-gold">
        <button onClick={() => go(-1)} aria-label="Carta anterior">‹ anterior</button>
        <button onClick={() => go(1)} aria-label="Próxima carta">próxima ›</button>
      </div>
    </div>
  );
}
