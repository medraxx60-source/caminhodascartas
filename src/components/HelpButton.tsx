export const WHATSAPP_NUMBER = "5563991167896";

export type HelpScreen = "planos" | "pergunta" | "cartas" | "pagamento" | "leitura";

export function helpMessage(screen: HelpScreen, orderCode?: string | undefined) {
  switch (screen) {
    case "planos": return "Olá! Estou no Caminho das Cartas e fiquei com uma dúvida sobre os planos e a consulta.";
    case "pergunta": return "Olá! Estou no Caminho das Cartas escolhendo o assunto e queria saber se as cartas respondem sobre a minha situação.";
    case "cartas": return "Olá! Estou na mesa de escolha das cartas no Caminho das Cartas e preciso de uma orientação.";
    case "pagamento": return `Olá! Preciso de ajuda com o pagamento Pix${orderCode ? ` do pedido ${orderCode}` : ""} no Caminho das Cartas.`;
    case "leitura": return "Olá! Acabei de ver minha leitura no Caminho das Cartas e gostaria de tirar uma dúvida sobre a mensagem das cartas.";
  }
}

export function helpLink(screen: HelpScreen, orderCode?: string | undefined) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(helpMessage(screen, orderCode))}`;
}

export function HelpButton({ screen, orderCode }: { screen: HelpScreen; orderCode?: string | undefined }) {
  return (
    <a
      href={helpLink(screen, orderCode)}
      target="_blank" rel="noopener noreferrer" aria-label="Precisa de ajuda? Falar no WhatsApp"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      className="fixed right-3 z-[60] flex items-center gap-1.5 rounded-full border border-gold bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground shadow-md"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.2.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"/></svg>
      <span className="sm:hidden">Ajuda</span><span className="hidden sm:inline">Precisa de ajuda?</span>
    </a>
  );
}
