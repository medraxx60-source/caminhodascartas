import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CARDS } from "@/lib/lenormand";
import { cardImage } from "@/components/TarotCard";
import cardBack from "@/assets/card-back.jpg";
import { adminStatus } from "@/lib/orders.functions";
import { adminGenerateContent, CONTENT_THEMES } from "@/lib/content.functions";

export const Route = createFileRoute("/admin_/conteudo")({
  head: () => ({
    meta: [
      { title: "Carta do Dia — Caminho das Cartas" },
      { name: "description", content: "Gerador de conteúdo para redes sociais." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Carta do Dia — Caminho das Cartas" },
      { property: "og:description", content: "Gerador de conteúdo para redes sociais." },
    ],
  }),
  component: ContentPage,
});

type Script = Awaited<ReturnType<typeof adminGenerateContent>>;
const AVAILABLE = CARDS.map((_, i) => i).filter((i) => !!cardImage(i));

function ContentPage() {
  const status = useServerFn(adminStatus);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return setOk(false);
      status().then((r) => setOk(r.isAdmin)).catch(() => setOk(false));
    });
  }, []);
  if (ok === null) return null;
  if (!ok) return (
    <main className="mx-auto max-w-sm px-5 py-12 text-center">
      <p>Entre no painel como administrador primeiro.</p>
      <Link to="/admin" className="mt-4 inline-block text-primary underline">Ir para o painel</Link>
    </main>
  );
  return <Studio />;
}

function Studio() {
  const gen = useServerFn(adminGenerateContent);
  const [card, setCard] = useState<number>(AVAILABLE[0] ?? 0);
  const [theme, setTheme] = useState<string>(CONTENT_THEMES[1]);
  const [script, setScript] = useState<Script | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const draw = () => { setCard(AVAILABLE[Math.floor(Math.random() * AVAILABLE.length)]!); setScript(null); };
  const generate = async () => {
    setBusy(true);
    try { setScript(await gen({ data: { card, theme } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar"); }
    finally { setBusy(false); }
  };
  const copy = (t: string, label: string) => { navigator.clipboard.writeText(t); toast.success(`${label} copiado`); };
  const full = script ? [script.gancho, script.mensagem, script.convite].filter(Boolean).join("\n\n") : "";

  if (recording) return <RecordingStage card={card} script={script} onExit={() => setRecording(false)} />;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/admin" className="text-sm text-muted-foreground hover:text-primary">← Voltar ao painel</Link>
      <h1 className="mt-4 text-4xl font-bold text-primary">Carta do Dia</h1>
      <p className="mt-1 text-sm text-muted-foreground">Escolha a carta e o tema, gere o roteiro e grave a tela limpa.</p>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="font-semibold">1. Carta</p>
        <div className="mt-3 flex gap-2">
          <select value={card} onChange={(e) => { setCard(Number(e.target.value)); setScript(null); }} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            {AVAILABLE.map((i) => <option key={i} value={i}>{i + 1} · {CARDS[i]}</option>)}
          </select>
          <Button variant="outline" onClick={draw}>Sortear</Button>
        </div>
        <p className="mt-4 font-semibold">2. Tema do vídeo</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CONTENT_THEMES.map((t) => <Button key={t} size="sm" variant={theme === t ? "default" : "outline"} onClick={() => { setTheme(t); setScript(null); }}>{t}</Button>)}
        </div>
        <Button className="mt-5 w-full" disabled={busy} onClick={generate}>{busy ? "Gerando roteiro..." : "Gerar roteiro"}</Button>
      </section>

      <section className="mt-4 rounded-lg border border-gold/60 bg-card p-4">
        <p className="font-semibold">3. Tela de gravação limpa</p>
        <p className="mt-1 text-xs text-muted-foreground">Ligue o gravador de tela do celular e toque na carta para virar. Para sair, segure o dedo na tela por 1 segundo.</p>
        <Button variant="outline" className="mt-3 w-full" onClick={() => setRecording(true)}>Abrir tela de gravação</Button>
      </section>

      {script && (
        <section className="mt-4 space-y-3">
          <p className="font-semibold">4. Roteiro (para o CapCut)</p>
          {([["Título da capa", script.titulo], ["Gancho", script.gancho], ["Mensagem", script.mensagem], ["Convite", script.convite], ["Legenda da postagem", script.legenda]] as const).map(([label, text]) => text ? (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold">{label}</p>
                <Button size="sm" variant="ghost" onClick={() => copy(text, label)}>Copiar</Button>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{text}</p>
            </div>
          ) : null)}
          <Button className="w-full" onClick={() => copy(full, "Roteiro completo")}>Copiar roteiro completo para narrar</Button>
          <Button variant="outline" className="w-full" asChild>
            <a href={cardImage(card)} download={`carta-${card + 1}.jpg`}>Baixar imagem da carta</a>
          </Button>
        </section>
      )}
    </main>
  );
}

function RecordingStage({ card, script, onExit }: { card: number; script: Script | null; onExit: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPara = script?.mensagem.split(/\n\s*\n/)[0]?.trim() ?? "";
  const start = () => { hold.current = setTimeout(onExit, 1000); };
  const cancel = () => { if (hold.current) clearTimeout(hold.current); };
  return (
    <div
      className="fixed inset-0 z-50 flex select-none flex-col items-center justify-center overflow-hidden bg-background px-6"
      style={{ background: "radial-gradient(ellipse at center, color-mix(in oklab, var(--primary) 22%, var(--background)) 0%, var(--background) 70%)" }}
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onContextMenu={(e) => e.preventDefault()}
    >
      <p className={`mb-8 max-w-sm text-center font-display text-2xl leading-snug text-foreground transition-opacity duration-1000 ${flipped || !script?.gancho ? "opacity-0" : "opacity-100"}`}>
        {script?.gancho}
      </p>
      <button type="button" onClick={() => setFlipped(true)} className="w-[62vw] max-w-[300px]" style={{ perspective: 1400 }} aria-label="Virar carta">
        <div className="relative aspect-[5/8] w-full transition-transform ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)", transitionDuration: "1800ms" }}>
          <img src={cardBack} alt="" className="absolute inset-0 h-full w-full rounded-xl object-cover shadow-2xl" style={{ backfaceVisibility: "hidden" }} />
          <img src={cardImage(card)} alt={CARDS[card]} className="absolute inset-0 h-full w-full rounded-xl object-cover shadow-2xl" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }} />
        </div>
      </button>
      <div className={`mt-8 max-w-sm text-center transition-all duration-1000 ${flipped ? "translate-y-0 opacity-100 delay-1000" : "translate-y-4 opacity-0"}`}>
        <p className="font-display text-3xl font-bold text-gold">{CARDS[card]}</p>
        {firstPara && <p className="mt-4 text-lg leading-relaxed text-foreground">{firstPara}</p>}
      </div>
    </div>
  );
}
