import { CONVERSION_EVENTS, type ConversionEvent, type ConversionPlan, type ConversionContext, cleanCampaignLabel, sanitizeConversionContext } from "./conversion-tracking";

/** São contagens de etapas, não prova causal da venda. */
export type ConversionEventRow = { session_id: string; event_name: ConversionEvent; plan: ConversionPlan; source: string; medium: string; campaign: string };
export type ConversionOrderRow = { conversion_session: string | null; is_free: boolean; status: string; plan: string };

export function summarizeConversionFunnel(events: ConversionEventRow[], orders: ConversionOrderRow[]) {
  const byEvent = (event: ConversionEvent) => new Set(events.filter(e => e.event_name === event).map(e => e.session_id)).size;
  const hasEvent = (session: string, event: ConversionEvent) => events.some(e => e.session_id === session && e.event_name === event);
  const trackedOrders = orders.filter(o => !!o.conversion_session);
  const completedFree = new Set(trackedOrders.filter(o => o.is_free && o.status === "done").map(o => o.conversion_session)).size;
  const paid = trackedOrders.filter(o => !o.is_free && o.status === "done");
  const paidSessions = new Set(paid.map(o => o.conversion_session));
  const sources = new Map<string,{visitors:number; buyers:number}>();
  const landings = events.filter(e => e.event_name === "landing_view");
  for (const e of landings) {
    const source = cleanCampaignLabel(e.source) || "direct";
    const row = sources.get(source) ?? { visitors: 0, buyers: 0 };
    row.visitors += 1;
    if (paidSessions.has(e.session_id)) row.buyers += 1;
    sources.set(source,row);
  }
  return {
    visits: byEvent("landing_view"),
    freeStarted: byEvent("free_start"),
    freeCompleted: completedFree,
    upgradeViewed: byEvent("upgrade_view"),
    fiveClicks: byEvent("upgrade_5"),
    sevenClicks: byEvent("upgrade_7"),
    pixViewed: byEvent("pix_view"),
    pixCopied: byEvent("pix_copy"),
    paidOrders: paid.length,
    trackedBuyers: paidSessions.size,
    sourceBreakdown: [...sources].map(([source, counts]) => ({ source, ...counts })).sort((a,b)=>b.visitors-a.visitors),
  };
}
