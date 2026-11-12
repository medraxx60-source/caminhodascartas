/** Medição first-party por aba: sem perguntas, cartas, links privados, IP ou pixels. */
export const CONVERSION_SESSION_KEY = "cc_conversion_session_v1";
export const CONVERSION_SOURCE_KEY = "cc_conversion_source_v1";
export const CONVERSION_EVENTS = ["landing_view","free_start","upgrade_view","upgrade_5","upgrade_7","pix_view","pix_copy"] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];
export type ConversionPlan = "none" | "essencial" | "profunda" | "completa";
export type ConversionContext = { sessionId: string; source: string; medium: string; campaign: string };
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Apenas rótulos de campanhas, jamais valores livres do usuário. */
export function cleanCampaignLabel(value: unknown, max = 32): string {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return candidate.length <= max && /^[a-z0-9][a-z0-9_-]*$/.test(candidate) ? candidate : "";
}
export function sanitizeConversionContext(input: Partial<ConversionContext>) {
  return {
    sessionId: typeof input.sessionId === "string" && UUID_PATTERN.test(input.sessionId) ? input.sessionId.toLowerCase() : null,
    source: cleanCampaignLabel(input.source) || "direct",
    medium: cleanCampaignLabel(input.medium),
    campaign: cleanCampaignLabel(input.campaign, 48),
  };
}
export function readCampaignParams(params: URLSearchParams) {
  return {
    source: cleanCampaignLabel(params.get("utm_source")) || "direct",
    medium: cleanCampaignLabel(params.get("utm_medium")),
    campaign: cleanCampaignLabel(params.get("utm_campaign"), 48),
  };
}
/** Chamado somente no navegador. A mesma aba conserva a origem durante o funil. */
export function getConversionContext(): ConversionContext | null {
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return null;
  try {
    let sessionId = sessionStorage.getItem(CONVERSION_SESSION_KEY);
    if (!sessionId || !UUID_PATTERN.test(sessionId)) {
      sessionId = window.crypto.randomUUID();
      sessionStorage.setItem(CONVERSION_SESSION_KEY, sessionId);
    }
    const params = new URLSearchParams(window.location.search);
    const hasCampaign = params.has("utm_source") || params.has("utm_medium") || params.has("utm_campaign");
    if (hasCampaign || !sessionStorage.getItem(CONVERSION_SOURCE_KEY)) {
      sessionStorage.setItem(CONVERSION_SOURCE_KEY, JSON.stringify(readCampaignParams(params)));
    }
    const stored = JSON.parse(sessionStorage.getItem(CONVERSION_SOURCE_KEY) || "{}");
    const clean = sanitizeConversionContext({ sessionId, ...stored });
    return clean.sessionId ? { ...clean, sessionId: clean.sessionId } : null;
  } catch { return null; }
}
