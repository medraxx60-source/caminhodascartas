// Shared definitions for the private Oracular Base (lenormand_cards). Position keys must match the DB trigger.
export const CARD_FIELDS = [
  { key: "core_meaning", label: "Significado central" },
  { key: "positive_meaning", label: "Aspectos positivos" },
  { key: "challenging_meaning", label: "Aspectos desafiadores" },
  { key: "love_meaning", label: "Amor" },
  { key: "work_meaning", label: "Trabalho" },
  { key: "money_meaning", label: "Dinheiro" },
  { key: "family_meaning", label: "Família" },
  { key: "spirituality_meaning", label: "Espiritualidade" },
  { key: "prediction_meaning", label: "Tendências e previsões" },
] as const;

export const POSITIONS = [
  { key: "passado_raiz", label: "Passado/Raiz" },
  { key: "raiz_da_questao", label: "Raiz da questão" },
  { key: "passado_recente", label: "Passado recente" },
  { key: "situacao_atual", label: "Situação atual" },
  { key: "momento_presente", label: "Momento presente" },
  { key: "o_que_esta_oculto", label: "O que está oculto" },
  { key: "influencia_oculta", label: "Influência oculta" },
  { key: "desafio", label: "Desafio" },
  { key: "tendencia", label: "Tendência" },
  { key: "conselho", label: "Conselho" },
  { key: "desfecho", label: "Desfecho" },
] as const;

export const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", completa: "Completa" };
