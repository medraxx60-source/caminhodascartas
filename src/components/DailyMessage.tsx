import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, MoonStar, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cardImage } from "@/components/TarotCard";
import cardBack from "@/assets/card-back.jpg";
import { CARDS } from "@/lib/lenormand";
import { DAILY_FLIP_MS, DAILY_MESSAGES, dailyDateKey, dailySelection, nextUnseenSlot } from "@/lib/daily-message";
import "./daily-message.css";

export function DailyMessage() {
  const [day, setDay] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState(false);
  const [seen, setSeen] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const selection = day ? dailySelection(day) : [];

  // Client calendar prevents SSR hydration differences around midnight.
  useEffect(() => {
    const update = () => {
      const key = dailyDateKey();
      setDay((previous) => {
        if (previous !== null && previous !== key) reset();
        return key;
      });
    };
    update();
    const id = setInterval(update, 30_000);
    return () => { clearInterval(id); if (timer.current) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!day) return;
    let live = true;
    setLoaded(false); setImageError(false);
    const sources = [cardBack, ...dailySelection(day).map(cardImage)];
    Promise.all(sources.map((src) => new Promise<void>((resolve, reject) => {
      if (!src) { reject(new Error("Face indisponible")); return; }
      const image = new Image();
      image.onload = () => {
        if (image.decode) image.decode().catch(() => {}).then(resolve);
        else resolve();
      };
      image.onerror = reject;
      image.src = src;
    }))).then(() => { if (live) setLoaded(true); }).catch(() => { if (live) setImageError(true); });
    return () => { live = false; };
  }, [day]);

  const clearReveal = () => {
    if (timer.current) clearTimeout(timer.current);
    busy.current = false;
    setActive(null); setRevealed(false); setResult(false);
  };
  function reset() { clearReveal(); setSeen([]); }

  const reveal = (slot: number) => {
    if (!loaded || busy.current) return;
    clearReveal(); busy.current = true;
    setActive(slot);
    // Two frames are not required: a short staged update gives Safari a painted back.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(() => {
      setRevealed(true);
      timer.current = setTimeout(() => {
        setSeen((previous) => previous.includes(slot) ? previous : [...previous, slot]);
        setResult(true); busy.current = false;
      }, reduced ? 0 : DAILY_FLIP_MS);
    }, reduced ? 0 : 60);
  };
  const cardIndex = active === null ? undefined : selection[active];
  const next = active === null ? null : nextUnseenSlot(active, seen);
  const completed = seen.length === 3;

  return (
    <main className={`daily-message min-h-svh bg-background text-foreground ${completed && result ? "daily-completed" : ""}`}>
      <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col px-5 pb-6 pt-5 lg:min-h-[900px]">
        <nav className="flex items-center justify-between" aria-label="Navegação">
          <Button asChild variant="ghost" size="sm" className="px-0 text-muted-foreground">
            <Link to="/"><ArrowLeft /> Caminho das Cartas</Link>
          </Button>
          <Button variant="ghost" size="icon" title="Recomeçar" aria-label="Recomeçar" onClick={reset}>
            <RotateCcw className="text-gold" />
          </Button>
        </nav>

        <header className="relative mt-4 text-center">
          <div className="daily-ornament mx-auto flex h-16 items-center justify-center gap-5 text-gold" aria-hidden="true">
            <Sparkles className="h-4 w-4" />
            <MoonStar className="h-12 w-12 stroke-1" />
            <Sparkles className="h-4 w-4" />
            <svg className="daily-crystal daily-crystal-left" viewBox="0 0 48 64"><path d="M8 46 18 9 29 3 40 39 31 59 18 61Z"/><path d="m18 9 7 32 6 18M29 3l-4 38-17 5m17-5 15-2M18 61l7-20"/></svg>
            <svg className="daily-crystal daily-crystal-right" viewBox="0 0 48 64"><path d="M8 46 18 9 29 3 40 39 31 59 18 61Z"/><path d="m18 9 7 32 6 18M29 3l-4 38-17 5m17-5 15-2M18 61l7-20"/></svg>
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {day ? day.split("-").reverse().join(" · ") : "Caminho das Cartas"}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-gold">MENSAGEM DO DIA</h1>
          <div className="gold-rule mx-auto mt-4 w-36" />
        </header>

        {!result && (
          <section className="flex flex-1 flex-col justify-center pb-10 pt-8 text-center" aria-label="Escolha sua carta">
            <p className="font-display text-2xl text-foreground">Escolha uma carta: 1, 2 ou 3</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((slot) => {
                const index = selection[slot];
                const flipping = active === slot && revealed;
                return (
                  <div key={slot} className="min-w-0">
                    <Button variant="ghost" className="daily-card-button relative block h-auto w-full p-0" aria-label={`Revelar carta ${slot + 1}`} disabled={!loaded || active !== null} onClick={() => reveal(slot)}>
                      <span className="daily-card-perspective block aspect-[5/8] w-full">
                        <span className={`daily-card-flip ${flipping ? "daily-is-revealed" : ""}`} data-revealed={flipping}>
                          <span className="daily-card-side"><img src={cardBack} alt="Carta virada para baixo" width={640} height={1024} /></span>
                          <span className="daily-card-side daily-card-front" aria-hidden={!flipping}>
                            {index !== undefined && <img src={cardImage(index)} alt={flipping ? CARDS[index] : ""} width={640} height={1024} />}
                          </span>
                        </span>
                      </span>
                    </Button>
                    <span className="mt-4 block font-display text-3xl font-semibold text-gold">{slot + 1}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-8 min-h-6 text-sm text-muted-foreground" role="status">
              {imageError ? "Não foi possível carregar as cartas. Tente novamente." : !loaded ? "Preparando suas cartas…" : active !== null ? "Sua carta está se revelando…" : "Um instante de conexão com você."}
            </p>
            {imageError && <Button variant="outline" className="mt-3" onClick={() => { setDay(null); setTimeout(() => setDay(dailyDateKey()), 0); }}>Carregar cartas novamente</Button>}
          </section>
        )}

        {result && cardIndex !== undefined && (
          <section className="pt-5 text-center" aria-label="Mensagem revelada" aria-live="polite">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Sua carta {active === null ? "" : active + 1} de 3</p>
            <img src={cardImage(cardIndex)} alt={CARDS[cardIndex]} width={640} height={1024} className="mx-auto aspect-[5/8] w-32 rounded-md object-cover ring-1 ring-gold/50 sm:w-44" />
            <h2 className="mt-4 font-display text-3xl font-semibold text-gold">{cardIndex + 1} · {CARDS[cardIndex]}</h2>
            <p className="mx-auto mt-3 max-w-md text-xl leading-relaxed text-foreground">{DAILY_MESSAGES[cardIndex]}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="outline" className="h-11 text-sm" onClick={clearReveal}><ArrowLeft />Voltar às 3 cartas</Button>
              {next !== null && <Button className="h-11 text-sm" onClick={() => reveal(next)}>Próxima carta<ArrowRight /></Button>}
            </div>
            {completed && (
              <footer className="mt-6 border-t border-gold/30 pt-5">
                <h3 className="font-display text-2xl text-gold">Quer fazer sua própria pergunta?</h3>
                <p className="mt-2 text-base text-foreground">Sua primeira tiragem de 3 cartas é grátis</p>
                <p className="mt-1 text-xs text-muted-foreground">Para novos visitantes, conforme disponibilidade da cortesia.</p>
                <Button asChild size="lg" className="mt-4 h-12 w-full"><Link to="/">Experimentar gratuitamente<ArrowRight /></Link></Button>
              </footer>
            )}
          </section>
        )}
        <p className="mt-auto pt-6 text-center text-xs text-muted-foreground">Caminho das Cartas · Uma pausa para ouvir a si mesmo</p>
      </div>
    </main>
  );
}