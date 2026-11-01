import { CARDS } from "./lenormand";

export type ContentScript = { titulo: string; gancho: string; mensagem: string; convite: string; legenda: string };

const LABELS = ["TITULO", "GANCHO", "MENSAGEM", "CONVITE", "LEGENDA"] as const;

// Social-media "Carta do Dia" script via the same MandAPI provider used for readings.
export async function generateContentScript(card: number, theme: string): Promise<ContentScript> {
  const apiKey = process.env["MANDAPI_API_KEY"];
  const rawBase = process.env["MANDAPI_BASE_URL"];
  if (!apiKey || !rawBase) throw new Error("Configuração da MandAPI ausente");
  const endpoint = `${rawBase.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}/chat/completions`;
  const system = [
    "Você escreve roteiros curtos de vídeo (TikTok/Reels, 30 segundos) para a página \"Caminho das Cartas\", de Baralho Cigano.",
    "Tom: cartomante acolhedora, português brasileiro simples, falado, humano. Nada de religião, entidades, feitiço, amarração ou promessas garantidas. Não diga que o futuro é certo.",
    "Responda EXATAMENTE neste formato, com cada rótulo em sua própria linha:",
    "TITULO: frase curta para a capa do vídeo (até 8 palavras)",
    "GANCHO: uma frase forte para os 3 primeiros segundos, falando direto com quem assiste",
    "MENSAGEM: 3 parágrafos curtos sobre o que esta carta traz hoje para o tema pedido, para ser narrado",
    "CONVITE: 1 a 2 frases convidando para fazer a primeira tiragem de 3 cartas gratuita no Caminho das Cartas, pelo link da bio",
    "LEGENDA: legenda da postagem com 1 frase e 5 a 7 hashtags, incluindo #baralhocigano e #caminhodascartas",
  ].join("\n");
  const user = `Carta: ${card + 1} · ${CARDS[card]}\nTema do vídeo: ${theme}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-5.6-sol", stream: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) {
    console.error(`[content] mandapi status=${res.status}`);
    throw new Error(res.status === 402 ? "Saldo insuficiente na MandAPI." : res.status === 429 ? "Limite de uso atingido. Tente em instantes." : `Não foi possível gerar o roteiro (erro ${res.status}).`);
  }
  const json: any = await res.json();
  const text: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("A IA respondeu sem texto.");
  return parseScript(text);
}

export function parseScript(text: string): ContentScript {
  const out: Record<string, string> = {};
  const re = new RegExp(`^\\s*\\**(${LABELS.join("|")}|TÍTULO)\\**\\s*:\\s*`, "gim");
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const key = m[1]!.toUpperCase().replace("Í", "I");
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1]!.index! : text.length;
    out[key] = text.slice(start, end).trim();
  });
  return {
    titulo: out["TITULO"] ?? "",
    gancho: out["GANCHO"] ?? "",
    mensagem: out["MENSAGEM"] ?? (marks.length ? "" : text),
    convite: out["CONVITE"] ?? "",
    legenda: out["LEGENDA"] ?? "",
  };
}
