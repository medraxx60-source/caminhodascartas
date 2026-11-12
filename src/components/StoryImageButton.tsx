export const SITE_URL = "https://caminhodascartas.lovable.app";

export function giftWhatsAppHref(advice: string) {
  const giftText = `Oi! Fiz uma tiragem no Baralho Cigano do Caminho das Cartas e lembrei de você 💛\n\nA mensagem que saiu pra mim foi:\n“${advice}”\n\nVocê também pode conhecer o Caminho das Cartas e verificar sua 1ª tiragem grátis: ${SITE_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=indicacao`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(giftText)}`;
}
