import { useState } from "react";
import { Button } from "@/components/ui/button";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// Builds a 1080x1920 image (Status/Stories) with the card and the angels' advice.
export function StoryImageButton({ cardSrc, cardName, advice }: { cardSrc?: string | undefined; cardName: string; advice: string }) {
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const c = document.createElement("canvas");
      c.width = 1080; c.height = 1920;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 0, 1920);
      g.addColorStop(0, "#2E1022"); g.addColorStop(1, "#1A0914");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
      ctx.strokeStyle = "#E8C872"; ctx.lineWidth = 4; ctx.strokeRect(50, 50, 980, 1820);
      ctx.textAlign = "center"; ctx.fillStyle = "#E8C872";
      ctx.font = "600 34px serif"; ctx.fillText("CONSELHO DOS ANJOS", 540, 170);
      let y = 230;
      if (cardSrc) {
        const img = await loadImg(cardSrc);
        const w = 420, h = 672, x = 540 - w / 2;
        ctx.drawImage(img, x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        y += h + 80;
      }
      ctx.font = "700 60px serif"; ctx.fillStyle = "#E8C872"; ctx.fillText(cardName, 540, y); y += 80;
      ctx.fillStyle = "#FFF3D6";
      let size = 46; let lines: string[];
      do { ctx.font = `italic ${size}px serif`; lines = wrap(ctx, `“${advice}”`, 880); size -= 2; } while (lines.length * size * 1.4 > 1700 - y && size > 26);
      for (const l of lines) { ctx.fillText(l, 540, y + size); y += size * 1.4; }
      ctx.fillStyle = "#E8C872"; ctx.font = "600 40px serif"; ctx.fillText("Caminho das Cartas", 540, 1790);
      ctx.font = "28px sans-serif"; ctx.fillStyle = "#FFF3D6"; ctx.fillText("caminhodascartas.lovable.app", 540, 1835);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      const file = new File([blob], "conselho-caminho-das-cartas.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Conselho dos Anjos" }).catch(() => {});
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } finally { setBusy(false); }
  };
  return (
    <Button variant="outline" className="mt-3 w-full border-gold text-gold" disabled={busy} onClick={make}>
      {busy ? "Preparando imagem..." : "Salvar imagem para Status / Stories"}
    </Button>
  );
}
