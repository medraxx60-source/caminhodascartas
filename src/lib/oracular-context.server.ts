import { buildOracularReference, type OracularReferenceRow } from "./oracular-context";
import type { PlanId } from "./lenormand";

/**
 * Preparação da Base Oracular para o motor de leitura.
 * DESATIVADO por padrão: requer configuração oracular_ai_enabled=true
 * E fichas completas e marcadas para publicação.
 * Ainda não está ligado à chamada da MandAPI (prompt protegido).
 */
export async function loadOracularReference(order: {
  plan: PlanId;
  cards: number[];
  category: string | null;
}): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const { data: setting, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "oracular_ai_enabled")
      .maybeSingle();
    if (settingsError || setting?.value !== true) return null;

    const selected = [...new Set(order.cards.filter((index) =>
      Number.isInteger(index) && index >= 0 && index < 36
    ).map((index) => index + 1))];
    if (!selected.length) return null;

    const { data, error } = await supabaseAdmin
      .from("lenormand_cards")
      .select("card_number,name,content_status,is_published,keywords,core_meaning,positive_meaning,challenging_meaning,love_meaning,work_meaning,money_meaning,family_meaning,spirituality_meaning,prediction_meaning,position_meanings")
      .in("card_number", selected)
      .eq("content_status", "completa")
      .eq("is_published", true);
    if (error || !data) return null;
    return buildOracularReference(order, data as OracularReferenceRow[]);
  } catch {
    // Falha no conteúdo editorial nunca deve bloquear ou cobrar nova geração.
    return null;
  }
}
