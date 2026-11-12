/**
 * Webhooks de pagamento opcionais. A assinatura é validada ANTES de consultar o pedido.
 * O evento não aprova pedidos: a API do intermediador é consultada novamente, no servidor.
 * Sem secrets configurados, estes endpoints recusam todas as notificações.
 */
export type PaymentProvider = "asaas" | "wyvi";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function hexDigest(data: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, "0")).join("");
}
export async function verifyPaymentWebhook(provider: PaymentProvider, headers: Headers, raw: string, env: NodeJS.ProcessEnv = process.env, nowMs = Date.now()): Promise<boolean> {
  if (provider === "asaas") {
    const configured = env["ASAAS_WEBHOOK_TOKEN"];
    const supplied = headers.get("asaas-access-token") || "";
    if (!configured || !supplied || configured.length < 16) return false;
    return safeEqual(await hexDigest(configured), await hexDigest(supplied));
  }
  const configured = env["WIVYPAY_WEBHOOK_SECRET"];
  const timestamp = headers.get("x-wyvi-carimbo") || "";
  const signature = headers.get("x-wyvi-assinatura") || "";
  if (!configured || configured.length < 16 || !/^\d{10}$/.test(timestamp) || !/^v1=[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(configured), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const actual = Array.from(new Uint8Array(signed), x => x.toString(16).padStart(2, "0")).join("");
  return safeEqual(actual, signature.slice(3).toLowerCase());
}

type ProviderNotice = {
  event?: unknown;
  evento?: unknown;
  payment?: { pixQrCodeId?: unknown; externalReference?: unknown };
  dados?: { txid?: unknown };
};
export function extractPaymentLookup(provider: PaymentProvider, notice: ProviderNotice): { qrId?: string; orderId?: string } | null {
  if (provider === "asaas") {
    if (notice.event !== "PAYMENT_RECEIVED" && notice.event !== "PAYMENT_CONFIRMED") return null;
    const id = notice.payment?.pixQrCodeId;
    const ref = notice.payment?.externalReference;
    if (typeof id === "string" && /^[a-zA-Z0-9_-]{4,120}$/.test(id)) return { qrId: id };
    if (typeof ref === "string" && /^[a-f0-9-]{36}$/i.test(ref)) return { orderId: ref };
  } else {
    if (notice.evento !== "cobranca.paga") return null;
    const txid = notice.dados?.txid;
    if (typeof txid === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(txid)) return { qrId: `wy:${txid}` };
  }
  return null;
}

async function verifyAndGenerate(provider: PaymentProvider, lookup: { qrId?: string; orderId?: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const query = supabaseAdmin.from("orders").select("access_token, asaas_qr_id, is_free").eq("is_free", false);
  const { data, error } = lookup.qrId
    ? await query.eq("asaas_qr_id", lookup.qrId).maybeSingle()
    : await query.eq("id", lookup.orderId!).maybeSingle();
  if (error || !data || !data.asaas_qr_id) return;
  // Nunca confie apenas no ID ou no valor recebidos no evento.
  if (provider === "asaas" && data.asaas_qr_id.startsWith("wy:")) return;
  if (provider === "wyvi" && !data.asaas_qr_id.startsWith("wy:")) return;
  const { syncAsaasPayment } = await import("./orders.functions");
  await syncAsaasPayment(data.access_token);
}

export async function handlePaymentWebhook(req: Request, provider: PaymentProvider, ctx?: unknown): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (Number(req.headers.get("content-length") || 0) > 32768) return new Response("Too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > 32768) return new Response("Too large", { status: 413 });
  if (!(await verifyPaymentWebhook(provider, req.headers, raw))) return new Response("Unauthorized", { status: 401 });
  let parsed: ProviderNotice;
  try { parsed = JSON.parse(raw) as ProviderNotice; } catch { return new Response("Bad request", { status: 400 }); }
  const lookup = extractPaymentLookup(provider, parsed);
  if (!lookup) return new Response("ok", { status: 200 });
  const job = verifyAndGenerate(provider, lookup);
  // Lovable Cloud/Cloudflare: resposta rápida, trabalho continua com waitUntil.
  const cloudCtx = ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
  if (typeof cloudCtx?.waitUntil === "function") {
    cloudCtx.waitUntil(job.catch(e => { console.error("[webhook] falha de processamento", e instanceof Error ? e.message : "erro"); }));
    return new Response("ok", { status: 200 });
  }
  // Em runtimes sem contexto de execução, conclua o processamento antes do ACK.
  // O provedor pode tentar novamente; a atualização atômica no pedido é idempotente.
  try { await job; return new Response("ok", { status: 200 }); }
  catch (e) { console.error("[webhook] falha", e instanceof Error ? e.message : "erro"); return new Response("Retry", { status: 503 }); }
}
