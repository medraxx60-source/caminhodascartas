import { CARDS } from "@/lib/lenormand";

export const DAILY_TIME_ZONE = "America/Araguaina";
export const DAILY_FLIP_MS = 650;

/** Calendar date in Brazil, independent of the device's timezone. */
export function dailyDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A seeded shuffle: three distinct cards, with no storage or network requests. */
export function dailySelection(dateKey: string): number[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Data inválida");
  let seed = 2166136261;
  for (const char of dateKey) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const deck = Array.from({ length: CARDS.length }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const current = deck[i];
    const other = deck[j];
    if (current === undefined || other === undefined) continue;
    deck[i] = other; deck[j] = current;
  }
  return deck.slice(0, 3);
}

// Public editorial content. Not personalized readings or private Oracular content.
export const DAILY_MESSAGES: readonly string[] = [
  "O Cavaleiro convida você a dar movimento ao que ficou parado. Um contato ou um pequeno primeiro passo pode abrir espaço para algo novo.",
  "O Trevo lembra que uma pequena oportunidade merece atenção. Aproveite o que está ao seu alcance, sem colocar tudo nas mãos da sorte.",
  "O Navio pede espaço para olhar além do habitual. Experimente um caminho diferente, respeitando o seu próprio ritmo.",
  "A Casa chama sua atenção para aquilo que lhe dá abrigo. Cuide de um cantinho seu e se aproxime de quem faz você se sentir em paz.",
  "A Árvore fala de raízes e de tempo. Cuide do que sustenta você, sem exigir que tudo floresça de uma vez.",
  "As Nuvens lembram que nem toda dúvida precisa de uma resposta imediata. Espere a mente clarear antes de decidir algo importante.",
  "A Cobra pede atenção ao que parece simples demais. Observe os detalhes e proteja seus limites sem tirar conclusões precipitadas.",
  "O Caixão convida a reconhecer o que já perdeu o sentido. Encerrar um pequeno ciclo pode deixar espaço para respirar de novo.",
  "O Buquê lembra a força de um gesto delicado. Ofereça ou aceite um carinho, sem achar que precisa merecer cada momento bom.",
  "A Foice pede clareza para cortar um excesso. Escolha com cuidado o que pode sair da sua rotina, sem agir no impulso.",
  "O Chicote chama atenção para um desgaste que se repete. Antes de entrar na mesma discussão, experimente uma resposta diferente.",
  "Os Pássaros convidam a conversar, mas também a escutar. Diminua o ruído e dê espaço a uma troca que realmente importe.",
  "A Criança traz um convite para começar pequeno. Permita-se aprender sem precisar acertar tudo na primeira tentativa.",
  "A Raposa pede discernimento no uso da sua energia. Confira os detalhes antes de assumir uma responsabilidade que não é sua.",
  "O Urso lembra que sua força também precisa de cuidado. Proteja o que importa sem carregar tudo sozinho.",
  "A Estrela convida a reencontrar uma direção que faça sentido. Escolha um passo possível para se aproximar do que você deseja.",
  "A Cegonha fala de mudanças que podem começar devagar. Ajuste algo pequeno na rotina e observe como você se sente.",
  "O Cachorro lembra o valor de uma presença leal. Procure quem sabe ouvir e cuide também das relações que lhe fazem bem.",
  "A Torre convida a um pouco de recolhimento. Ter espaço para si não precisa significar se afastar de todo mundo.",
  "O Jardim pede abertura para o encontro. Participe de uma conversa ou de um lugar onde você possa estar à vontade.",
  "A Montanha lembra que um obstáculo não define todo o caminho. Divida o que parece grande em um passo que caiba no dia de hoje.",
  "Os Caminhos convidam a escolher com consciência. Em vez de procurar uma opção perfeita, observe qual respeita melhor seus valores.",
  "O Rato chama atenção para pequenos desgastes. Veja o que anda levando sua energia e cuide disso antes de se cobrar mais.",
  "O Coração pede presença no que você sente. Demonstre afeto com sinceridade, sem esquecer os seus próprios limites.",
  "O Anel lembra o peso e o valor dos compromissos. Repare se aquilo que você promete também pode ser sustentado com tranquilidade.",
  "O Livro convida a respeitar o que ainda não está claro. Faça uma pergunta, pesquise um pouco e não tenha pressa de concluir.",
  "A Carta pede cuidado com a forma de se expressar. Uma mensagem clara e gentil pode evitar um mal-entendido.",
  "O Cigano convida você a assumir uma posição mais consciente. Diga o que precisa com firmeza, sem deixar de escutar o outro.",
  "A Cigana lembra a importância de ouvir sua percepção. Acolha o que sente e confira os fatos antes de dar o próximo passo.",
  "Os Lírios pedem serenidade nas suas escolhas. Nem toda situação precisa de uma reação imediata; preserve o que traz paz.",
  "O Sol convida a reconhecer o que já tem luz na sua vida. Celebre um avanço pequeno e use essa clareza para seguir.",
  "A Lua pede respeito ao seu mundo interior. Dê nome ao que sente, sem transformar uma emoção passageira em certeza.",
  "A Chave convida a olhar para uma solução possível. Às vezes, a abertura começa por uma atitude simples que você já pode tomar.",
  "Os Peixes pedem atenção ao que circula na sua vida. Cuide dos seus recursos e evite decisões financeiras por impulso.",
  "A Âncora lembra o valor da constância. Sustente o que faz bem, mas observe se a segurança não virou um peso.",
  "A Cruz convida a tratar seus próprios fardos com gentileza. Você pode pedir apoio e não precisa provar força carregando tudo sozinho.",
];

export function nextUnseenSlot(current: number, seen: readonly number[]): number | null {
  for (let offset = 1; offset <= 3; offset++) {
    const slot = (current + offset) % 3;
    if (!seen.includes(slot)) return slot;
  }
  return null;
}