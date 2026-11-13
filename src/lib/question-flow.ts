/** Ao trocar de assunto, limpar somente um exemplo escolhido previamente.
 * Nunca preencher a pergunta automaticamente nem apagar textos próprios do consulente. */
export function questionAfterCategoryChange(
  question: string,
  suggestions: Record<string, string[]>,
): string {
  const wasExample = Object.values(suggestions).some((items) => items.includes(question));
  return wasExample ? "" : question;
}
