import { useServerFn } from "@tanstack/react-start";
import { recordConversionEvent } from "./conversion.functions";
import { getConversionContext, type ConversionEvent, type ConversionPlan } from "./conversion-tracking";

/** Best effort: nunca atrasa a navegação, a leitura ou o Pix. */
export function useConversion() {
  const send = useServerFn(recordConversionEvent);
  return (event: ConversionEvent, plan: ConversionPlan = "none") => {
    const ctx = getConversionContext();
    if (!ctx) return;
    void send({ data: { event, plan, sessionId: ctx.sessionId, source: ctx.source, medium: ctx.medium, campaign: ctx.campaign } })
      .catch(() => { /* métricas não são requisito para o produto funcionar */ });
  };
}
