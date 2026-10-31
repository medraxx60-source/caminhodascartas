import { useEffect, useState } from "react";

const KEY = "entre_cartas_a11y";
const SIZES = [100, 115, 130, 150];

export function AccessibilityControls() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(0);
  const [contrast, setContrast] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (typeof s.size === "number") setSize(Math.min(Math.max(s.size, 0), SIZES.length - 1));
      if (s.contrast) setContrast(true);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const html = document.documentElement;
    html.style.fontSize = `${SIZES[size]}%`;
    html.classList.toggle("high-contrast", contrast);
    localStorage.setItem(KEY, JSON.stringify({ size, contrast }));
  }, [size, contrast, loaded]);

  return (
    <div className="fixed bottom-3 left-3 z-[70]">
      {open && (
        <div role="dialog" aria-label="Acessibilidade" className="mb-2 w-64 rounded-xl border-2 border-gold bg-card p-4 text-foreground shadow-xl">
          <p className="font-display text-xl font-semibold text-gold">Acessibilidade</p>
          <p className="mt-3 text-sm font-semibold">Tamanho do texto</p>
          <div className="mt-2 flex items-center gap-2">
            <button aria-label="Diminuir texto" disabled={size === 0} onClick={() => setSize(size - 1)} className="h-11 flex-1 rounded-lg border border-gold bg-background text-lg font-bold disabled:opacity-40">A−</button>
            <span className="w-12 text-center text-sm">{SIZES[size]}%</span>
            <button aria-label="Aumentar texto" disabled={size === SIZES.length - 1} onClick={() => setSize(size + 1)} className="h-11 flex-1 rounded-lg border border-gold bg-background text-xl font-bold disabled:opacity-40">A+</button>
          </div>
          <button aria-pressed={contrast} onClick={() => setContrast(!contrast)} className={`mt-4 h-11 w-full rounded-lg border-2 border-gold text-sm font-bold ${contrast ? "bg-gold text-background" : "bg-background text-foreground"}`}>
            {contrast ? "✓ Alto contraste ligado" : "Ligar alto contraste"}
          </button>
          <button onClick={() => { setSize(0); setContrast(false); }} className="mt-2 w-full text-sm underline">Voltar ao padrão</button>
        </div>
      )}
      <button aria-label="Opções de acessibilidade" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-12 items-center gap-1.5 rounded-full border-2 border-gold bg-card px-3 text-base font-bold text-gold shadow-md">
        <span aria-hidden className="text-lg">Aa</span><span className="text-sm">Acessibilidade</span>
      </button>
    </div>
  );
}
