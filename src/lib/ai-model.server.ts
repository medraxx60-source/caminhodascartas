// Active MandAPI model, chosen by the admin panel (app_settings key "mandapi_model").
export const DEFAULT_AI_MODEL = "gpt-6-sol";
export const MODEL_RE = /^[A-Za-z0-9._:\/-]{2,80}$/;

export async function getAiModel(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "mandapi_model").maybeSingle();
    const v = typeof data?.value === "string" ? data.value : "";
    return MODEL_RE.test(v) ? v : DEFAULT_AI_MODEL;
  } catch {
    return DEFAULT_AI_MODEL;
  }
}
