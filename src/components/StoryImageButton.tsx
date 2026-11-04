import { Button } from "@/components/ui/button";

export const SITE_URL = "https://caminhodascartas.lovable.app";

export function StoryImageButton({ advice }: { cardSrc?: string | undefined; cardName?: string; advice: string }) {
  const giftText = `Oi! Fiz uma tiragem no Baralho Cigano do Caminho das Cartas e lembrei de você 💛\n\nA mensagem que saiu pra mim foi:\n“${advice}”\n\nVocê também pode fazer a sua 1ª tiragem grátis, com 3 cartas: ${SITE_URL}`;
  const waHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(giftText)}`;

  return (
    <div className="mt-6 rounded-lg border border-gold/60 bg-background/40 p-4">
      <p className="text-2xl text-gold">🎁</p>
      <h3 className="mt-1 font-display text-2xl font-semibold text-primary">Presenteie alguém especial</h3>
      <p className="mt-2 text-base leading-relaxed">
        Envie para uma amiga ou alguém da família a 1ª tiragem grátis de 3 cartas.
      </p>
      <Button asChild className="gold-button mt-4 h-auto min-h-12 w-full whitespace-normal py-3 text-base">
        <a href={waHref} target="_blank" rel="noopener noreferrer">Enviar presente pelo WhatsApp</a>
      </Button>
    </div>
  );
}
