import { HelpButton, helpLink } from "@/components/HelpButton";
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
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { createOrder, getOrderStatus, checkFreeReading, createFreeOrder } from "@/lib/orders.functions";
import cardBackSrc from "@/assets/card-back.jpg";
import heroSrc from "@/assets/caminho-das-cartas-hero.jpg";
import presentSrc from "@/assets/presente-tiragem-banner.jpg";

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


function scrollToId(id: string, delay = 150) {
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), delay);
}

function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

const PENDING_KEY = "entre_cartas_pending_order";
const FREE_DRAFT_KEY = "entre_cartas_free_draft";

function Index() {
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [step, setStep] = useState(0);
  const [ritualDone, setRitualDone] = useState(false);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  // Cards carried over from a previous reading when expanding to a bigger plan; they stay fixed.
  const [lockedPicks, setLockedPicks] = useState(0);
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
  const [fp, setFp] = useState<string | undefined>(undefined);
  const [free, setFree] = useState<{ enabled: boolean; eligible: boolean } | null>(null);
  const [myReadings, setMyReadings] = useState<{ token: string; at: string; plan: string }[]>([]);
  useEffect(() => {
    try { setMyReadings(JSON.parse(localStorage.getItem("entre_cartas_readings") || "[]")); } catch {}
  }, []);
  // Shortcuts from the end of a reading: /?plano=profunda&categoria=Amor...
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const pl = sp.get("plano"), cat = sp.get("categoria"), q = sp.get("pergunta"), cs = sp.get("cartas");
      if (!pl && !cat) return;
      if (cat && (CATEGORIES as readonly string[]).includes(cat)) setCategory(cat as Category);
      if (pl && pl in PLANS) {
        setPlan(pl as PlanId); setDeck(shuffle(CARDS.length)); setStep(1);
        // Expansion: keep the previous question and cards, user only picks the remaining ones.
        const prev = (cs ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < CARDS.length);
        const uniq = [...new Set(prev)];
        if (q && q.trim() && uniq.length && uniq.length < PLANS[pl as PlanId].count) {
          setQuestion(q.slice(0, 1000)); setPicked(uniq); setLockedPicks(uniq.length); setRitualDone(true); setStep(2);
        }
      }
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
    const devId = id;
    getDeviceFingerprint().catch(() => undefined).then((f) => { setFp(f); return checkFree({ data: { deviceId: devId, fp: f } }); }).then((f) => {
      setFree(f);
      // Returning visitors who used the free reading start with the Profunda pre-selected.
      if (f?.enabled && !f.eligible) setPlan((cur) => cur ?? "profunda");
    }).catch(() => setFree(null));
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
      setPicked([]); setLockedPicks(0); setDeck(shuffle(CARDS.length));
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
    setPicked([]); setLockedPicks(0); setDeck(shuffle(CARDS.length)); setQuestion(""); setCategory(null); setRitualDone(false);
    goStep(0);
  };

  const submit = async () => {
    if (!plan || !p) return;
    // Reuse the existing unpaid order instead of creating a duplicate.
    if (token) { setPixOpen(true); return; }
    setLoading(true);
    try {
      if (isFreePlan(plan) && deviceId) {
        try { localStorage.removeItem(FREE_DRAFT_KEY); } catch {}
        const r = await createFree({ data: { deviceId, fp, category: category ?? "Outros assuntos", question, cards: picked } });
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

  const [gateOpen, setGateOpen] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const signInGoogle = async () => {
    setGateBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { setGateBusy(false); toast.error("Não foi possível conectar com o Google. Tente novamente."); return; }
    if (r.redirected) return;
    setGateBusy(false); setGateOpen(false);
    setResumeFree(true);
  };
  // After Google returns (popup or full redirect), restore the chosen cards and reveal the reading.
  const [resumeFree, setResumeFree] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(FREE_DRAFT_KEY) || "null");
      if (!d || Date.now() - (d.at ?? 0) > 60 * 60 * 1000) { localStorage.removeItem(FREE_DRAFT_KEY); return; }
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;
        setPlan("essencial"); if (d.category) setCategory(d.category); setQuestion(d.question ?? "");
        setPicked(d.cards ?? []); setRitualDone(true); setStep(2); setResumeFree(true);
      });
    } catch {}
  }, []);
  useEffect(() => {
    if (resumeFree && free?.eligible && deviceId && plan === "essencial" && picked.length === 3) { setResumeFree(false); submit(); }
  }, [resumeFree, free, deviceId, plan, picked]);

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
  // Home starts with the topic (connection first); the plan is preselected and shown with its price before the cards.
  const startWith = (c: Category | null) => {
    const def: PlanId = plan ?? (free?.enabled && free.eligible ? "essencial" : "profunda");
    choosePlan(def);
    if (c) {
      setCategory(c);
      if (!question.trim()) setQuestion((QUESTION_SUGGESTIONS[c] ?? QUESTION_SUGGESTIONS["Outros assuntos"]!)[0]!);
    }
    try { navigator.vibrate?.(30); } catch {}
    goStep(1);
  };
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); }, [step, ritualDone]);
  // When the last card is drawn, bring the payment button under the thumb.
  useEffect(() => {
    if (p && picked.length === p.count && !token) scrollToId("ver-interpretacao", 700);
  }, [picked.length, p, token]);

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
      <header className="mb-10 pt-14 text-center">
        <h1 className="sr-only">Caminho das Cartas — Baralho Cigano</h1>
        <img src={heroSrc} alt="Caminho das Cartas" width={1200} height={564} fetchPriority="high"
          className="-mx-5 block w-[calc(100%+2.5rem)] max-w-none [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)]" />
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-gold">Baralho Cigano tradicional</p>
        <p className="mt-4 text-lg leading-snug text-foreground/90">Coloque sua dúvida diante da mesa e veja o que as cartas revelam.</p>
        {free?.enabled && free.eligible ? (
          <img src={presentSrc} alt="Sua 1ª tiragem de 3 cartas é um presente" width={1920} height={640}
            className="mx-auto mt-5 block w-full max-w-md rounded-xl" />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Consultas a partir de R$ 4,90 · pagamento por Pix</p>
        )}
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
          <a href={helpLink("planos")} target="_blank" rel="noreferrer" className="block rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground">Ajuda pelo WhatsApp <span className="float-right text-gold">›</span></a>
        </SheetContent>
      </Sheet>

      <section className="text-center">
        <h2 className="font-display text-2xl text-gold">Qual assunto pede luz hoje?</h2>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {CATEGORIES.map((c, i) => (
            <button key={c} type="button" onClick={() => startWith(c)}
              className={`flex min-h-[3.25rem] items-center justify-center rounded-xl border border-gold/25 bg-gold/[0.04] px-3 py-2 text-sm font-medium leading-tight text-gold/90 backdrop-blur-sm transition-colors hover:border-gold/50 active:bg-gold/20 ${i === CATEGORIES.length - 1 && CATEGORIES.length % 2 === 1 ? "col-span-2" : ""}`}>
              {c}
            </button>
          ))}
        </div>
      </section>
      <div className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>🔒 Sigilosa</span><span>⚡ Sem cadastro</span><span>✦ Resposta na hora</span>
      </div>
      <Button size="lg" className="gold-button mt-6 h-14 w-full rounded-xl text-lg" onClick={() => startWith(null)}>
        ✦ Abrir minha mesa de cartas
      </Button>
      <HomeTrust />
      </>)}

      {p && step === 1 && (
        <section className="mt-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold text-foreground">Sobre o que é sua consulta?</h2>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => { setCategory(c); if (!question.trim() || Object.values(QUESTION_SUGGESTIONS).some((l) => l.includes(question))) setQuestion((QUESTION_SUGGESTIONS[c] ?? QUESTION_SUGGESTIONS["Outros assuntos"]!)[0]!); scrollToId("escolher-cartas"); }} aria-pressed={category === c}
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
              {!category ? "" : qOk ? "Sua pergunta está pronta ✓" : "Conte um pouco mais sobre sua dúvida (ao menos uma frase)"}
            </p>
          </div>
          <h3 className="mt-8 font-display text-2xl font-semibold text-foreground">Quantas cartas abrir?</h3>
          <div className="mt-3 space-y-2">
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const pl = PLANS[id];
              const active = plan === id;
              return (
                <button key={id} type="button" onClick={() => choosePlan(id)} aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${active ? "border-gold bg-secondary shadow-[0_0_24px_-8px] shadow-gold" : "border-border bg-card"}`}>
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-semibold leading-tight">{pl.count} cartas · {pl.name}{id === "profunda" && <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-gold">✦ Mais escolhida</span>}</span>
                    <span className="block text-xs text-muted-foreground">{PLAN_HINT[id]}</span>
                  </span>
                  <span className="shrink-0 font-display text-xl font-bold text-gold">{priceLabel(id)}</span>
                </button>
              );
            })}
          </div>
          <Button id="escolher-cartas" size="lg" className="gold-button mt-8 h-14 w-full scroll-mb-6 rounded-xl text-lg"
            onClick={() => (qOk ? goStep(2) : document.getElementById("pergunta")?.focus())}>
            {qOk ? "Escolher minhas cartas" : !category ? "Escolha um assunto para continuar" : "Escreva sua pergunta para continuar"}
          </Button>
        </section>
      )}

      {p && step === 2 && !ritualDone && (
        <section className="flex min-h-[calc(100dvh-5rem)] flex-col justify-center py-4 animate-in fade-in duration-1000 text-center">
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
            {lockedPicks > 0 ? (
              <p className="mx-auto mt-2 max-w-xs text-base text-foreground/90">Suas {lockedPicks} cartas da leitura anterior continuam na mesa ✦ Escolha mais {p.count - lockedPicks} para aprofundar.</p>
            ) : (
              <p className="mx-auto mt-2 max-w-xs text-muted-foreground">Deslize para os lados e toque na carta do centro ✦</p>
            )}
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
                  className={`flex h-14 w-10 overflow-hidden items-center justify-center rounded-md border font-display text-lg font-bold shadow-inner transition-all ${filled ? "border-gold bg-gold text-background shadow-lg" : "border-gold/40 bg-secondary text-foreground/80"} ${i < lockedPicks ? "ring-2 ring-gold ring-offset-2 ring-offset-background" : ""}`}>
                  {filled ? <img src={cardImage(picked[i]!)} alt={CARDS[picked[i]!]} className="h-full w-full object-cover" /> : i + 1}
                </button>
              );
            })}
          </div>
          {picked.length > lockedPicks && !token && (
            <button type="button" disabled={loading}
              onClick={() => { setPicked((cur) => cur.slice(0, lockedPicks)); setDeck(shuffle(CARDS.length)); }}
              className="mx-auto mt-3 block text-sm text-gold underline-offset-4 hover:underline">
              ↻ Embaralhar e escolher novamente
            </button>
          )}
          <Button id="ver-interpretacao" size="lg" className={`gold-button mt-8 h-14 w-full scroll-mb-6 rounded-xl text-lg ${picked.length === p.count && !loading ? "animate-pulse [animation-duration:2.5s]" : ""}`} disabled={loading || picked.length < p.count} onClick={submit}>
            {loading ? "Preparando sua leitura..." : picked.length < p.count ? `Escolha mais ${p.count - picked.length} carta(s)` : token ? `Continuar pagamento · Pedido ${orderCode}` : `Ver interpretação · ${plan ? priceLabel(plan) : ""}`}
          </Button>
        </section>
      )}

      {/* Payment screen is locked: it only leaves when the admin approves and we redirect to the reading. */}
      <Dialog open={gateOpen} onOpenChange={(o) => !gateBusy && setGateOpen(o)}>
        <DialogContent className="mystic w-[calc(100%-1.5rem)] max-w-md rounded-lg p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-3xl text-gold">✦ Mesa consagrada ✦</DialogTitle>
            <DialogDescription className="text-center text-base">Suas 3 cartas foram escolhidas e sua consulta de presente está pronta. Conecte-se em 1 toque para liberar sua leitura.</DialogDescription>
          </DialogHeader>
          <button type="button" onClick={signInGoogle} disabled={gateBusy}
            style={{ background: "#FFFFFF", color: "#1F1F1F", border: "1px solid #747775" }}
            className="mx-auto mt-2 flex h-12 w-full items-center justify-center gap-[10px] rounded-xl px-3 text-[14px] font-medium leading-5 disabled:opacity-60">
            <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
            {gateBusy ? "Conectando..." : "Continuar com o Google"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">🔒 100% sigiloso · Sem senha · Sem mensagens</p>
        </DialogContent>
      </Dialog>

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
              <a href={helpLink("pagamento", orderCode)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />Preciso de ajuda com o Pix</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <footer className="mt-24 space-y-2 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
        <p>Tiragens para reflexão e autoconhecimento. Não substituem orientação médica, jurídica ou financeira.</p>
        <p>© {new Date().getFullYear()} Caminho das Cartas · Todos os direitos reservados.</p>
        <a href="/admin" className="inline-block text-muted-foreground/60 hover:underline">Acesso administrativo</a>
      </footer>
      <HelpButton screen={token ? "pagamento" : step === 0 ? "planos" : step === 1 ? "pergunta" : "cartas"} orderCode={orderCode || undefined} />
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
