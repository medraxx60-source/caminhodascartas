import pixQrImage from "@/assets/pix-qrcode.png";

export const CARDS = [
  "O Cavaleiro", "O Trevo", "O Navio", "A Casa", "A Árvore", "As Nuvens",
  "A Cobra", "O Caixão", "O Buquê", "A Foice", "O Chicote", "Os Pássaros",
  "A Criança", "A Raposa", "O Urso", "A Estrela", "A Cegonha", "O Cachorro",
  "A Torre", "O Jardim", "A Montanha", "Os Caminhos", "O Rato", "O Coração",
  "O Anel", "O Livro", "A Carta", "O Cigano", "A Cigana", "Os Lírios",
  "O Sol", "A Lua", "A Chave", "Os Peixes", "A Âncora", "A Cruz",
] as const;

export type PlanId = "essencial" | "profunda" | "completa";

export const PLANS: Record<PlanId, { name: string; count: number; priceCents: number; positions: string[] }> = {
  essencial: { name: "Essencial", count: 3, priceCents: 490, positions: ["Situação atual", "Desafio", "Tendência"] },
  profunda: {
    name: "Profunda", count: 5, priceCents: 890,
    positions: ["Situação atual", "Desafio", "Influência oculta", "Conselho", "Tendência"],
  },
  completa: {
    name: "Completa", count: 7, priceCents: 1490,
    positions: ["Raiz da questão", "Passado recente", "Situação atual", "Desafio", "Influência oculta", "Conselho", "Desfecho provável"],
  },
};

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Public payment details displayed in the Pix dialog.
export const PIX_KEY = "34cdba87-43b2-4e53-ac3a-113c86eeacca";
export const PIX_QR_SRC = pixQrImage;
