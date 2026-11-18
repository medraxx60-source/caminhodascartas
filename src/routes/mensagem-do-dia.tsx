import { createFileRoute } from "@tanstack/react-router";
import { DailyMessage } from "@/components/DailyMessage";

export const Route = createFileRoute("/mensagem-do-dia")({
  head: () => ({
    meta: [
      { title: "Mensagem do Dia — Caminho das Cartas" },
      { name: "description", content: "Escolha uma das três cartas e receba uma mensagem do dia do Baralho Cigano. Um momento de reflexão, sem cadastro." },
      { property: "og:title", content: "Mensagem do Dia — Caminho das Cartas" },
      { property: "og:description", content: "Três cartas, uma pausa para você. Descubra sua mensagem diária de Baralho Cigano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyMessage,
});