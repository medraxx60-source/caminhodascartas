import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

async function drawStory(cardSrc: string | undefined, cardName: string, advice: string) {
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
  return blob;
}

export const SITE_URL = "https://caminhodascartas.lovable.app";
export function StoryImageButton({ cardSrc, cardName, advice }: { cardSrc?: string | undefined; cardName: string; advice: string }) {
  const shareText = `Olha só a mensagem que saiu pra mim no Baralho Cigano do Caminho das Cartas hoje:\n\n“${advice}”\n\nFaça a sua 1ª consulta grátis aqui: ${SITE_URL}`;
  const waHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);

  const openImage = async () => {
    setBusy(true);
    try {
      const blob = await drawStory(cardSrc, cardName, advice);
      const file = new File([blob], "conselho-caminho-das-cartas.png", { type: "image/png" });
      setPreview({ url: URL.createObjectURL(blob), file });
    } finally { setBusy(false); }
  };
  const close = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };
  const canShareFile = !!preview && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [preview.file] });
  const shareFile = async () => {
    if (!preview) return;
    await navigator.share({ files: [preview.file] }).catch(() => {});
  };

  return (
    <div className="mt-4 space-y-3">
      <Button asChild className="gold-button h-auto min-h-12 w-full whitespace-normal py-3">
        <a href={waHref} target="_blank" rel="noopener noreferrer">✦ Compartilhar no WhatsApp</a>
      </Button>
      <Button variant="outline" className="h-auto min-h-12 w-full whitespace-normal border-gold py-3 text-gold" disabled={busy} onClick={openImage}>
        {busy ? "Preparando imagem..." : "Ver imagem para Status / Stories"}
      </Button>
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-h-[92dvh] w-[92vw] max-w-sm overflow-y-auto p-4">
          <DialogTitle className="text-center font-display text-xl text-primary">Imagem para Status / Stories</DialogTitle>
          <DialogDescription className="text-center text-base">
            Toque e segure na imagem e escolha “Salvar na galeria”. Depois poste no Status do WhatsApp ou nos Stories.
          </DialogDescription>
          {preview && <img src={preview.url} alt="Conselho dos Anjos" className="mx-auto max-h-[55dvh] w-auto rounded-md border border-gold" />}
          {canShareFile && (
            <Button className="gold-button w-full" onClick={shareFile}>Enviar imagem</Button>
          )}
          <Button variant="outline" className="w-full" onClick={close}>Voltar para a leitura</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
