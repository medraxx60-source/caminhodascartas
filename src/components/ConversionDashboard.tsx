import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { adminGetConversionMetrics } from "@/lib/conversion.functions";

type Summary = Awaited<ReturnType<typeof adminGetConversionMetrics>>;

export function ConversionDashboard() {
  const loadReport = useServerFn(adminGetConversionMetrics);
  const [days,setDays] = useState<7|30>(7);
  const [report,setReport] = useState<Summary | null>(null);
  const [loading,setLoading] = useState(true);
  const [failure,setFailure] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(false);
    loadReport({ data: { days } }).then(r => {
      if (!cancelled) setReport(r);
    }).catch(() => { if (!cancelled) setFailure(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);
  const items = report ? [
    ["Visitaram o site", report.visits],
    ["Iniciaram grátis", report.freeStarted],
    ["Concluíram grátis", report.freeCompleted],
    ["Viram pós-grátis", report.upgradeViewed],
    ["Clicaram em 5 cartas", report.fiveClicks],
    ["Clicaram em 7 cartas", report.sevenClicks],
    ["Abriram Pix", report.pixViewed],
    ["Copiaram Pix", report.pixCopied],
    ["Compras concluídas", report.paidOrders],
  ] : [];
  return (
    <section className="mt-5 rounded-xl border border-gold/40 bg-card p-4" aria-label="Funil de conversão">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary">Funil de vendas</h2>
          <p className="text-xs text-muted-foreground">Medição própria, sem perguntas ou dados bancários.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={days===7?"default":"outline"} onClick={()=>setDays(7)}>7 dias</Button>
          <Button size="sm" variant={days===30?"default":"outline"} onClick={()=>setDays(30)}>30 dias</Button>
        </div>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">Carregando conversões…</p>}
      {failure && <p className="mt-4 text-sm text-destructive">Não foi possível consultar o funil. As compras continuam funcionando.</p>}
      {!loading && !failure && report && (<>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map(([label,value])=>(
            <div key={label} className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs leading-tight text-muted-foreground">{label}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-primary">{value}</p>
            </div>
          ))}
        </div>
        <h3 className="mt-5 font-semibold text-primary">De onde vieram os visitantes?</h3>
        <div className="mt-2 space-y-2 text-sm">
          {report.sourceBreakdown.length===0 && <p className="text-muted-foreground">Nenhuma campanha registrada ainda.</p>}
          {report.sourceBreakdown.map(source=>(
            <div key={source.source} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span className="min-w-0 truncate font-medium">{source.source}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{source.visitors} visitas · {source.buyers} compradores</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          As métricas começam a ser coletadas nesta atualização; dados anteriores não são recuperáveis por etapa.
          Eventos contam visitantes por aba e estágio (não são um funil de coortes perfeito).
          Compras são contadas a partir de pedidos pagos e concluídos vinculados à mesma sessão;
          acessos administrativos e testes podem aparecer.
        </p>
      </>)}
    </section>
  );
}
