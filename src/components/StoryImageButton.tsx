export const SITE_URL = "https://caminhodascartas.lovable.app";

export function giftWhatsAppHref(advice: string) {
  const giftText = `Oi! Fiz uma tiragem no Baralho Cigano do Caminho das Cartas e lembrei de você 💛\n\nA mensagem que saiu pra mim foi:\n“${advice}”\n\nVocê também pode fazer a sua 1ª tiragem grátis, com 3 cartas: ${SITE_URL}`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(giftText)}`;
}
