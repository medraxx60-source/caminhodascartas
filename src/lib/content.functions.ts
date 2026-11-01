import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CARDS } from "./lenormand";

export const CONTENT_THEMES = ["Amor e relacionamento", "Conselho do dia", "Alerta para a semana", "Dinheiro e trabalho"] as const;

export const adminGenerateContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { card: number; theme: string }) => {
    const card = Number(input.card);
    if (!Number.isInteger(card) || card < 0 || card >= CARDS.length) throw new Error("Carta inválida");
    const theme = (CONTENT_THEMES as readonly string[]).includes(input.theme) ? input.theme : CONTENT_THEMES[1];
    return { card, theme };
  })
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Acesso negado");
    const { generateContentScript } = await import("./content.server");
    return generateContentScript(data.card, data.theme);
  });
