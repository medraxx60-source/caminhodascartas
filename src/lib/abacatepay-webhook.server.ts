import { z } from "zod";
import { abacateConfig, ABACATE_PREFIX, pixIdSchema, type AbacateConfig } from "./abacatepay.server";

// Public global HMAC key published at https://docs.abacatepay.com/pages/notificacoes/seguranca
export const ABACATEPAY_PUBLIC_KEY = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";
async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}
export async function verifyAbacateWebhook(req: Request, raw: Uint8Array, config: AbacateConfig): Promise<boolean> {
  const secret = req.headers.get("X-Webhook-Secret") ?? new URL(req.url).searchParams.get("webhookSecret") ?? "";
  if (!config.webhookSecret || !secret || !(await sameSecret(secret, config.webhookSecret))) return false;
  const signature = req.headers.get("X-Webhook-Signature") ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ABACATEPAY_PUBLIC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, bytes, new Uint8Array(raw));
}
const noticeSchema = z.object({
  id: z.string().min(1).max(150), event: z.literal("transparent.completed"), apiVersion: z.literal(2), devMode: z.boolean(),
  data: z.object({ transparent: z.object({ id: pixIdSchema, amount: z.number().int().positive(), status: z.literal("PAID"),
    externalId: z.string().max(100).nullish(), metadata: z.object({ pedidoId: z.string().uuid() }).passthrough(), devMode: z.boolean(),
  }).passthrough() }).passthrough(),
}).passthrough();
type Notice = z.infer<typeof noticeSchema>;
async function processNotice(notice: Notice) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error } = await supabaseAdmin.from("orders")
    .select("id, access_token, asaas_qr_id, price_cents, status, is_free")
    .eq("asaas_qr_id", ABACATE_PREFIX + notice.data.transparent.id).eq("is_free", false).maybeSingle();
  if (error) throw new Error("Payment lookup unavailable");
  if (!order) return;
  const payment = notice.data.transparent;
  if (order.id !== payment.metadata.pedidoId || order.price_cents !== payment.amount ||
    (payment.externalId != null && payment.externalId !== order.id)) throw new Error("Payment binding mismatch");
  if (order.status === "done" || order.status === "rejected") return;
  const { syncAsaasPayment } = await import("./orders.functions");
  // Await durable payment claim / generation outcome before ACK; failures stay retryable.
  await syncAsaasPayment(order.access_token);
  const { data: after } = await supabaseAdmin.from("orders").select("status").eq("id", order.id).maybeSingle();
  if (!after || after.status === "pending") throw new Error("Payment not confirmed yet");
}
export async function handleAbacateWebhook(req: Request, config: AbacateConfig, process = processNotice): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (Number(req.headers.get("content-length") ?? 0) > 32768) return new Response("Too large", { status: 413 });
  // Bound streamed requests too, before buffering an attacker-controlled body.
  const reader = req.body?.getReader();
  if (!reader) return new Response("Bad request", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 32768) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
    chunks.push(chunk.value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
  if (!(await verifyAbacateWebhook(req, raw, config))) return new Response("Unauthorized", { status: 401 });
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { return new Response("Bad request", { status: 400 }); }
  const event = z.object({ event: z.string().max(100) }).safeParse(body);
  if (event.success && event.data.event !== "transparent.completed") return new Response("ok");
  const parsed = noticeSchema.safeParse(body);
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  if (parsed.data.devMode !== (config.environment === "sandbox") || parsed.data.data.transparent.devMode !== parsed.data.devMode)
    return new Response("Environment mismatch", { status: 400 });
  try { await process(parsed.data); return new Response("ok"); }
  catch { return new Response("Retry", { status: 503 }); }
}

/** Called from a server route handler or server entry fetch only. */
export async function abacateWebhookEndpoint(request: Request): Promise<Response> {
  return handleAbacateWebhook(request, abacateConfig(process.env));
}