/** Assuntos e perguntas: nunca escolher a pergunta pelo cliente automaticamente. */
export function shouldClearSuggestedQuestion(question: string, suggestions: Record<string, readonly string[]>): boolean {
  return Object.values(suggestions).some((options) => options.includes(question));
}

/** Quando mudamos de assunto, só apagamos um exemplo escolhido da lista.
 * Perguntas redigidas pelo cliente permanecem intactas. */
export function questionAfterCategoryChange(
  question: string,
  suggestions: Record<string, readonly string[]>,
): string {
  return shouldClearSuggestedQuestion(question, suggestions) ? "" : question;
}

export function actionForCards(picked: number, required: number, free: boolean, price: string): string {
  if (picked < required) return `Escolha mais ${required - picked} carta${required - picked === 1 ? "" : "s"}`;
  return free ? "Receber minha leitura grátis" : `Ir para o Pix · ${price}`;
}
