/**
 * Limites por tiragem para evitar esperar até 70s em consultas curtas travadas.
 * Todos ficam abaixo do retry de 90s para pedidos pagos e 120s para gratuitos.
 * NUNCA chama a IA novamente: apenas limita uma requisição existente.
 */
export function readingTimeoutMs(cardCount: number): number {
  if (cardCount <= 3) return 55_000;
  if (cardCount <= 5) return 65_000;
  return 70_000;
}
