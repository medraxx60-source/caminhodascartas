import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { HomeTrust } from "@/components/HomeTrust";
import { Check, Copy, Menu, MessageCircle } from "lucide-react";
import { CardBack, CardReveal, preloadCardImages, cardImage } from "@/components/TarotCard";
import { CARDS, PLANS, PIX_KEY, PIX_QR_SRC, formatBRL, type PlanId , CATEGORIES, type Category } from "@/lib/lenormand";
import { createOrder, getOrderStatus, checkFreeReading, createFreeOrder } from "@/lib/orders.functions";
import heroTarot from "@/assets/hero-tarot.jpg";
import cardBackSrc from "@/assets/card-back.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caminho das Cartas — Baralho Cigano online" },
      { name: "description", content: "Faça sua pergunta objetiva sobre amor, dinheiro, saúde ou espiritualidade e receba sua leitura de Baralho Cigano." },
      { property: "og:title", content: "Caminho das Cartas — Baralho Cigano online" },
      { property: "og:description", content: "Leituras de Baralho Cigano personalizadas, a partir de R$ 4,90." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://caminhodascartas.lovable.app/__l5e/assets-v1/5d79658c-3851-488d-b2b6-126ea53c114b/caminho-das-cartas-share-v2.jpg" },
      { name: "twitter:image", content: "https://caminhodascartas.lovable.app/__l5e/assets-v1/5d79658c-3851-488d-b2b6-126ea53c114b/caminho-das-cartas-share-v2.jpg" },
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
  const [copied, setCopied] = useState(false);
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
  // Shortcuts from the end of a reading: /?plano=profunda&categoria=Amor...
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const pl = sp.get("plano"), cat = sp.get("categoria");
      if (!pl && !cat) return;
      if (cat && (CATEGORIES as readonly string[]).includes(cat)) setCategory(cat as Category);
      if (pl && pl in PLANS) { setPlan(pl as PlanId); setDeck(shuffle(CARDS.length)); setStep(1); }
      window.history.replaceState(null, "", "/");
    } catch {}
  }, []);
  const [reservedAt, setReservedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [token]);
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
        setReservedAt(s.at ?? Date.now());
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
      setReservedAt(Date.now());
      setToken(r.token);
      setPixOpen(true);
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ token: r.token, orderCode: r.orderCode, plan, category, question, cards: picked, at: Date.now() })); } catch {}
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
      return true;
    } catch {
      toast.error("Não foi possível copiar. Tente novamente ou use o QR Code.");
      return false;
    }
  };

  const MIN_Q = 10;
  const qLen = question.trim().length;
  const qOk = qLen >= MIN_Q && !!category;
  const missing: string[] = [];
  if (p && !qOk) missing.push(`Escrever sua pergunta (mínimo ${MIN_Q} caracteres)`);
  if (p && picked.length < p.count) missing.push(`Escolher mais ${p.count - picked.length} carta(s)`);
  const ready = !!p && missing.length === 0;

  const goStep = (s: number) => { setStep(s); };
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); }, [step, ritualDone]);

  return (
    <div className="mystic min-h-screen">
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-20">
      {step > 0 && (
        <div className="flex items-center gap-3 pt-5">
          <button onClick={() => goStep(step - 1)} aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-card text-gold text-xl">‹</button>
          <p className="flex-1 text-center font-display text-xl text-foreground">Caminho das Cartas</p>
          <span className="w-11 text-right text-xs text-muted-foreground">{step + 1}/3</span>
        </div>
      )}

      {step === 0 && (<>
      <header className="relative -mx-5 mb-6 overflow-hidden">
        <img src={heroTarot} alt="Cartas de tarô sobre veludo verde com vela e estrelas douradas" width={1280} height={960} className="h-[260px] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Baralho Cigano · Leitura online</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground">Caminho das Cartas</h1>
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
            <SheetTitle className="font-display text-2xl text-gold">Caminho das Cartas</SheetTitle>
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
              onClick={() => { choosePlan(id); try { navigator.vibrate?.(30); } catch {} }}
              aria-pressed={active}
              className={`flex w-full items-center justify-between gap-4 rounded-xl border-2 p-5 text-left shadow-sm transition-all duration-200 active:scale-[0.98] ${active ? "border-gold bg-secondary shadow-[0_0_30px_-8px] shadow-gold" : "border-border bg-card hover:-translate-y-0.5 hover:border-gold/70"}`}
            >
              <div className="min-w-0">
                {isFreePlan(id) && <span className="mb-1 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">1ª Tiragem Gratuita</span>}
                {id === "profunda" && <span className="mb-1 inline-block rounded-full border border-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">✦ Mais escolhida</span>}
                <h3 className="font-display text-2xl font-semibold leading-tight">{pl.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{pl.count} cartas · {PLAN_HINT[id]}</p>
                <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                  {pl.positions.map((pos) => <li key={pos} className="flex gap-1.5"><span className="text-gold">✓</span>{pos}</li>)}
                </ul>
              </div>
              <span className="shrink-0 font-display text-2xl font-bold text-gold">{priceLabel(id)}</span>
            </button>
          );
        })}
      </section>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>🔒 Consulta anônima e sigilosa</span><span>⚡ Sem cadastro</span><span>✦ Baralho Cigano tradicional</span>
      </div>
      {free?.enabled && !free.eligible && (
        <p className="mt-4 rounded-xl border border-gold/40 bg-card/70 p-4 text-center text-sm text-muted-foreground">Você já aproveitou sua 1ª leitura de cortesia ✦ As tiragens de 5 e 7 cartas trazem uma visão ainda mais completa da sua situação.</p>
      )}
      <Button size="lg" className="gold-button mt-8 h-14 w-full rounded-xl text-lg" disabled={!p} onClick={() => goStep(1)}>
        {p ? `Continuar com ${p.name}` : "Escolha uma consulta acima"}
      </Button>
      <HomeTrust />
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
                      <button key={s} type="button" onClick={() => setQuestion(s)} className="rounded-full border border-gold/50 bg-background/60 px-4 py-2.5 text-left text-sm text-foreground active:bg-gold active:text-background">“{s}”</button>
                    ))}
                  </div>
                </div>
              )}
            </>)}
            <p className={`mt-2 text-sm ${qOk ? "text-gold" : category && qLen > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {!category ? "Escolha um assunto acima" : qOk ? "Sua pergunta está pronta ✓ Vamos às cartas." : "Conte um pouco mais sobre sua dúvida (ao menos uma frase)"}
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
            <p className="mx-auto mt-2 max-w-xs text-muted-foreground">Deslize para os lados e toque na carta do centro ✦</p>
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
                  className={`flex h-14 w-10 overflow-hidden items-center justify-center rounded-md border font-display text-lg font-bold shadow-inner transition-all ${filled ? "border-gold bg-gold text-background shadow-lg" : "border-gold/40 bg-secondary text-foreground/80"}`}>
                  {filled ? <img src={cardImage(picked[i]!)} alt={CARDS[picked[i]!]} className="h-full w-full object-cover" /> : i + 1}
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
        <DialogContent className="mystic w-[calc(100%-1.5rem)] max-w-lg max-h-[90dvh] min-w-0 overflow-x-hidden overflow-y-auto rounded-lg p-5 pb-8 sm:p-6 [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display text-3xl text-primary">Pague com Pix</DialogTitle>
            <DialogDescription className="text-base">Falta só o pagamento para iniciar a sua interpretação.</DialogDescription>
          </DialogHeader>
          <dl className="min-w-0 space-y-2 border-y border-border py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Sua consulta</dt><dd className="font-semibold text-foreground">{p?.name} · {p?.count} cartas</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Pedido</dt><dd className="break-all font-mono text-foreground">{orderCode}</dd></div>
            {question.trim() && (
              <div className="min-w-0"><dt className="text-muted-foreground">Sua pergunta</dt><dd className="mt-1 break-words font-display text-lg italic leading-snug text-foreground">“{question.trim()}”</dd></div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-base text-foreground">Total a pagar</dt><dd className="font-display text-3xl font-bold text-gold">{p && formatBRL(p.priceCents)}</dd></div>
          </dl>
          {reservedAt && (() => {
            const left = Math.max(0, 15 * 60 - Math.floor((now - reservedAt) / 1000));
            const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
            return (
              <div className="rounded-lg border border-gold/60 bg-gold/10 p-3 text-center">
                {left > 0 ? (
                  <p className="text-base font-semibold text-foreground">✦ Suas cartas estão reservadas por <span className="font-mono text-gold" aria-live="off">{mm}:{ss}</span></p>
                ) : (
                  <p className="text-base font-semibold text-foreground">✦ Suas cartas continuam guardadas. Conclua o Pix para receber sua leitura.</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">⚡ Assim que o Pix for confirmado, sua interpretação abre sozinha nesta tela.</p>
              </div>
            );
          })()}
          {pixCode ? (
            <>
              <Button size="lg" className="gold-button h-14 w-full min-w-0 whitespace-normal rounded-lg px-3 text-base leading-snug" onClick={async () => { if (await copy(pixCode.payload, "Código Pix")) { setCopied(true); try { navigator.vibrate?.(60); } catch {} } }}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                <span>{copied ? "Código Pix copiado!" : "Copiar código Pix"}</span>
              </Button>
              <p aria-live="polite" className="text-center text-base leading-relaxed text-foreground">{copied ? "Agora cole o código em Pix Copia e Cola no app do seu banco e confirme o pagamento." : "Use Pix Copia e Cola no app do seu banco."}</p>
              <ol className="min-w-0 space-y-3 text-base text-foreground">
                {["Copie o código Pix acima.", "No app do banco, abra Pix Copia e Cola, cole o código e confirme o pagamento.", "Volte a esta tela para receber sua interpretação após a confirmação."].map((t, i) => (
                  <li key={t} className="flex min-w-0 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-background">{i + 1}</span>
                    <span className="min-w-0 flex-1 break-words leading-relaxed">{t}</span>
                  </li>
                ))}
              </ol>
              {pixCode.image && (
                <details className="text-center text-sm text-muted-foreground">
                  <summary className="cursor-pointer">Prefere escanear? Ver QR Code</summary>
                  <img src={`data:image/png;base64,${pixCode.image}`} alt="QR Code Pix" className="mx-auto mt-3 aspect-square w-48 max-w-full rounded-md border border-gold object-contain" />
                </details>
              )}
              <p className="text-center text-sm text-muted-foreground">🔒 Pode ir ao app do banco tranquilo(a): seu pedido fica guardado.</p>
            </>
          ) : (
            <>
            <Button size="lg" className="gold-button h-14 w-full min-w-0 whitespace-normal rounded-lg px-3 text-base leading-snug" onClick={async () => { if (await copy(PIX_KEY, "Chave Pix")) { setCopied(true); try { navigator.vibrate?.(60); } catch {} } }}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span>{copied ? "Chave Pix copiada!" : "Copiar chave Pix"}</span>
            </Button>
            <p aria-live="polite" className="text-center text-base leading-relaxed text-foreground">{copied ? "Agora abra o app do seu banco e faça um Pix usando a chave copiada." : "No app do banco, faça um Pix usando esta chave."}</p>
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-center text-xs">{PIX_KEY}</code>
            <p className="text-center text-base leading-relaxed text-foreground">Digite <strong>{p && formatBRL(p.priceCents)}</strong> e confirme o pagamento. Depois, volte a esta tela.</p>
            <details className="text-center text-sm text-muted-foreground">
              <summary className="cursor-pointer py-2">Prefere escanear? Ver QR Code</summary>
              <img src={PIX_QR_SRC} alt="QR Code Pix" className="mx-auto mt-3 aspect-square w-48 max-w-full rounded-md border border-gold object-contain" />
            </details>
            <p className="text-center text-sm leading-relaxed text-muted-foreground">🔒 Seu pedido e suas cartas ficam guardados enquanto você vai ao app do banco.</p>
            <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border pt-3">
              <p className="min-w-0 flex-1 break-words text-sm leading-relaxed">Na descrição do Pix, informe: <span className="break-all font-mono font-bold text-primary">{orderCode}</span></p>
              <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Copiar número do pedido" title="Copiar número do pedido" onClick={() => copy(orderCode, "Número do pedido")}><Copy aria-hidden="true" /></Button>
            </div>
            </>
          )}
          <div className="space-y-2 border-t border-border pt-3 text-center">
            {nudged ? (
              <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm font-semibold text-foreground">Atenção: conferimos e o seu Pix ainda não foi identificado. Verifique no app do seu banco se a transferência foi concluída com o valor correto.</p>
            ) : slow ? (
              <p role="status" className="rounded-md border border-gold bg-gold/10 p-3 text-sm text-foreground">Ainda não identificamos a sua transferência. Abra o app do seu banco, cole o código Pix e confirme o pagamento para iniciar a sua interpretação.</p>
            ) : null}
            <p role="status" className="flex min-w-0 items-start justify-center gap-3 rounded-md border border-gold/60 bg-gold/10 p-4 text-left text-base font-semibold leading-relaxed text-foreground"><span aria-hidden="true" className="mt-2 inline-block h-3 w-3 shrink-0 rounded-full bg-gold motion-safe:animate-pulse" /><span className="min-w-0 flex-1 break-words">Aguardando confirmação do pagamento… assim que confirmado, sua interpretação abre sozinha nesta tela.</span></p>
            <Button asChild variant="link" className="h-auto min-h-11 w-full whitespace-normal text-base">
              <a href={`https://wa.me/5563991167896?text=${encodeURIComponent(`Olá! Preciso de ajuda com o pedido ${orderCode} no Caminho das Cartas.`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />Preciso de ajuda com o Pix</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <footer className="mt-24 space-y-2 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
        <p>Tiragens para reflexão e autoconhecimento. Não substituem orientação médica, jurídica ou financeira.</p>
        <p>© {new Date().getFullYear()} Caminho das Cartas · Todos os direitos reservados.</p>
        <a href="/admin" className="inline-block text-muted-foreground/60 hover:underline">Acesso administrativo</a>
      </footer>
      <a
        href={`https://wa.me/5563991167896?text=${encodeURIComponent(orderCode ? `Olá! Preciso de ajuda com o pedido ${orderCode} no Caminho das Cartas.` : "Olá! Preciso de ajuda no Caminho das Cartas.")}`}
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
  const [hint, setHint] = useState(true);
  useEffect(() => { const t = setTimeout(() => setHint(false), 6000); return () => clearTimeout(t); }, []);
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
        className="relative mx-auto h-[400px] w-full touch-none overscroll-contain overflow-hidden"
        onTouchStart={(e) => { setHint(false); setStartX(e.touches[0]!.clientX); setDrag(0); }}
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
        <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center transition-opacity duration-700 ${hint && picked.length === 0 ? "opacity-100" : "opacity-0"}`}>
          <span className="flex items-center gap-2 rounded-full border border-gold/60 bg-background/85 px-4 py-2 text-sm font-semibold text-gold shadow-lg backdrop-blur">
            <span className="motion-safe:animate-[swipe-hint_1.6s_ease-in-out_infinite]">←</span> Deslize e toque na carta do centro <span className="motion-safe:animate-[swipe-hint_1.6s_ease-in-out_infinite_reverse]">→</span>
          </span>
        </div>
      </div>
      <div className="mt-3 mb-5 flex justify-center gap-6 text-sm text-gold">
        <button onClick={() => { setHint(false); go(-1); }} aria-label="Carta anterior">‹ anterior</button>
        <button onClick={() => { setHint(false); go(1); }} aria-label="Próxima carta">próxima ›</button>
      </div>
    </div>
  );
}
