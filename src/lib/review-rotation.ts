/** Navegação cíclica; comprimento 0/1 não produz transições inválidas. */
export function nextReviewIndex(current: number, count: number, direction: 1 | -1 = 1): number {
  if (!Number.isInteger(count) || count <= 1) return 0;
  const safeCurrent = Number.isInteger(current) && current >= 0 && current < count ? current : 0;
  return (safeCurrent + direction + count) % count;
}
