import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONVERSION_EVENTS, cleanCampaignLabel, UUID_PATTERN } from "./conversion-tracking";
import { summarizeConversionFunnel, type ConversionEventRow, type ConversionOrderRow } from "./conversion-metrics";

const eventSchema = z.object({
  event: z.enum(CONVERSION_EVENTS),
  plan: z.enum(["none","essencial","profunda","completa"]).default("none"),
  sessionId: z.string().regex(UUID_PATTERN),
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
});

/** Analytics privados: eventos de etapa, nunca texto da consulta ou token de leitura. */
export const recordConversionEvent = createServerFn({ method: "POST" })
  .inputValidator((input) => eventSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("conversion_events") as any).upsert({
      session_id: data.sessionId.toLowerCase(),
      event_name: data.event,
      plan: data.plan,
      source: cleanCampaignLabel(data.source) || "direct",
      medium: cleanCampaignLabel(data.medium),
      campaign: cleanCampaignLabel(data.campaign, 48),
    }, { onConflict: "session_id,event_name,plan", ignoreDuplicates: true });
    // Falha de analytics nunca impede entrar no site, gerar uma leitura ou pagar Pix.
    if (error) console.warn("[conversion] insert failed", error.code);
    return { ok: !error };
  });

export const adminGetConversionMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: 7 | 30 }) => ({ days: input?.days === 30 ? 30 as const : 7 as const }))
  .handler(async ({ context, data }) => {
    const { data: authorized, error: authError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (authError || !authorized) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const [events, orders] = await Promise.all([
      supabaseAdmin.from("conversion_events")
        .select("session_id,event_name,plan,source,medium,campaign")
        .gte("created_at", since).limit(10000),
      supabaseAdmin.from("orders")
        .select("conversion_session,is_free,status,plan")
        .gte("created_at", since).not("conversion_session", "is", null).limit(10000),
    ]);
    if (events.error || orders.error) throw new Error("Não foi possível carregar o funil");
    return { days: data.days, ...summarizeConversionFunnel(
      (events.data ?? []) as ConversionEventRow[], (orders.data ?? []) as ConversionOrderRow[],
    ) };
  });
