import { z } from "zod";
import { decode } from "fast-png";
import jsQR from "jsqr";
import type { PixCharge } from "./asaas.server";

const BASE = "https://api.abacatepay.com/v2/transparents";
export const ABACATE_PREFIX = "ab:";
export const ABACATE_VERSION = "abacate-v2";
export const pixIdSchema = z.string().regex(/^pix_char_[a-zA-Z0-9_-]{6,120}$/);
export type AbacateConfig = { apiKey: string; webhookSecret: string; environment: "sandbox" | "production"; enabled: boolean; validated: boolean };
export type PixOptions = { orderId: string; orderCode: string; valueCents: number };
export type PixResult = { charge: PixCharge | null; issue: { status: number; code: string } | null };

/** Called only with environment values read inside a server handler. No implicit activation. */
export function abacateConfig(env: NodeJS.ProcessEnv): AbacateConfig {
  return {
    apiKey: env["ABACATEPAY_API_KEY"] ?? "", webhookSecret: env["ABACATEPAY_WEBHOOK_SECRET"] ?? "",
    environment: env["ABACATEPAY_ENVIRONMENT"] === "production" ? "production" : "sandbox",
    enabled: env["ABACATEPAY_ENABLED"] === "true", validated: env["ABACATEPAY_SANDBOX_VALIDATED"] === "true",
  };
}
export function checkoutReady(config: AbacateConfig): boolean {
  return !!config.apiKey && !!config.webhookSecret && config.enabled && config.validated;
}

const success = z.union([z.literal(true), z.object({ message: z.string().min(1).max(500) })]);
const paymentSchema = z.object({
  id: pixIdSchema, amount: z.number().int().positive(), status: z.string().max(32), devMode: z.boolean(),
  externalId: z.string().max(100).nullish(), metadata: z.object({ pedidoId: z.string().uuid() }).passthrough(),
  brCode: z.string().min(40).max(5000).optional(), brCodeBase64: z.string().max(2_000_000).optional(),
}).passthrough();
function payment(body: unknown) {
  const parsed = z.object({ success, error: z.null().optional(), data: paymentSchema }).safeParse(body);
  return parsed.success ? parsed.data.data : null;
}
function matches(data: z.infer<typeof paymentSchema>, opts: PixOptions, config: AbacateConfig): boolean {
  return data.amount === opts.valueCents && data.metadata.pedidoId === opts.orderId &&
    (data.externalId == null || data.externalId === opts.orderId) && data.devMode === (config.environment === "sandbox");
}

/** Validate EMV TLV and CRC, including amount when encoded in the BR Code. */
export function validBrCode(payload: string, amount: number): boolean {
  if (!payload.startsWith("000201") || !/6304[0-9A-F]{4}$/i.test(payload)) return false;
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload.slice(0, -4))) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  if (crc.toString(16).padStart(4, "0").toUpperCase() !== payload.slice(-4).toUpperCase()) return false;
  let at = 0;
  let pix = false;
  const seen = new Set<string>();
  while (at < payload.length) {
    const tag = payload.slice(at, at + 2), sizeText = payload.slice(at + 2, at + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(sizeText) || seen.has(tag)) return false;
    seen.add(tag);
    const end = at + 4 + Number(sizeText);
    if (end > payload.length) return false;
    const value = payload.slice(at + 4, end);
    if (Number(tag) >= 26 && Number(tag) <= 51 && value.toLowerCase().includes("br.gov.bcb.pix")) pix = true;
    if (tag === "54" && (!/^\d+\.\d{2}$/.test(value) || Math.round(Number(value) * 100) !== amount)) return false;
    if (tag === "53" && value !== "986") return false;
    if (tag === "58" && value !== "BR") return false;
    at = end;
  }
  return pix && seen.has("53") && seen.has("58") && seen.has("63");
}

/** Decode locally, never trust a data URI merely because it starts with image/png. */
function verifiedPng(uri: string, payload: string): string | null {
  const encoded = uri.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
  if (!encoded || encoded.length > 2_000_000 || encoded.length % 4 !== 0) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b)) return null;
    const view = new DataView(bytes.buffer);
    const width = view.getUint32(16), height = view.getUint32(20);
    if (width < 21 || height < 21 || width > 1024 || height > 1024) return null;
    const png = decode(bytes, { checkCrc: true });
    if (png.depth !== 8 || png.width !== width || png.height !== height) return null;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const offset = i * png.channels;
      const gray = png.data[offset] ?? 0;
      rgba[i * 4] = gray;
      rgba[i * 4 + 1] = png.channels <= 2 ? gray : (png.data[offset + 1] ?? 0);
      rgba[i * 4 + 2] = png.channels <= 2 ? gray : (png.data[offset + 2] ?? 0);
      rgba[i * 4 + 3] = png.channels === 2 || png.channels === 4 ? (png.data[offset + png.channels - 1] ?? 255) : 255;
    }
    return jsQR(rgba, width, height)?.data === payload ? encoded : null;
  } catch { return null; }
}
export function parseAbacatePix(body: unknown, opts: PixOptions, config: AbacateConfig): PixCharge | null {
  const data = payment(body);
  if (!data || !matches(data, opts, config) || data.status !== "PENDING" || !data.brCode || !data.brCodeBase64 ||
    !validBrCode(data.brCode, opts.valueCents)) return null;
  const image = verifiedPng(data.brCodeBase64, data.brCode);
  return image ? { id: ABACATE_PREFIX + data.id, payload: data.brCode, image } : null;
}

class ProviderFailure extends Error {
  constructor(readonly status: number, readonly code: string) { super("Pix provider unavailable"); }
}
async function request(path: string, config: AbacateConfig, body?: object): Promise<unknown> {
  if (!config.apiKey) throw new ProviderFailure(0, "missing_api_key");
  const response = await fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new ProviderFailure(response.status, response.status === 401 ? "credential_rejected" : "provider_unavailable");
  try { return await response.json(); } catch { throw new ProviderFailure(response.status, "invalid_response"); }
}
export async function createAbacatePix(opts: PixOptions, config: AbacateConfig, recover = false): Promise<PixResult> {
  if (!checkoutReady(config)) return { charge: null, issue: { status: 0, code: "checkout_disabled" } };
  if (!z.object({ orderId: z.string().uuid(), orderCode: z.string().regex(/^[A-F0-9]{8}$/), valueCents: z.number().int().min(100).max(100000) }).safeParse(opts).success)
    return { charge: null, issue: { status: 0, code: "invalid_order" } };
  try {
    if (recover) {
      // externalId is documented as the idempotency reference. Recover lost responses before POSTing again.
      const list = await request(`list?externalId=${encodeURIComponent(opts.orderId)}&limit=2`, config);
      const parsed = z.object({ success, error: z.null().optional(), data: z.array(z.unknown()).max(2) }).safeParse(list);
      if (!parsed.success || parsed.data.data.length > 1) throw new ProviderFailure(0, "ambiguous_charge");
      const found = parsed.data.data[0];
      if (found) {
        const charge = parseAbacatePix({ success: true, data: found }, opts, config);
        if (!charge) throw new ProviderFailure(0, "invalid_existing_charge");
        return { charge, issue: null };
      }
    }
    const body = await request("create", config, { method: "PIX", data: {
      amount: opts.valueCents, description: `Caminho das Cartas pedido ${opts.orderCode}`, expiresIn: 3600,
      externalId: opts.orderId, metadata: { pedidoId: opts.orderId },
    } });
    const charge = parseAbacatePix(body, opts, config);
    return charge ? { charge, issue: null } : { charge: null, issue: { status: 0, code: "invalid_pix_payload" } };
  } catch (error) {
    return { charge: null, issue: error instanceof ProviderFailure ? { status: error.status, code: error.code } : { status: 0, code: "network_error" } };
  }
}

/** A webhook is only a hint: both provider reads and the stored order binding are mandatory. */
export async function confirmAbacatePayment(qrId: string, opts: PixOptions, config: AbacateConfig): Promise<string | null> {
  const id = qrId.startsWith(ABACATE_PREFIX) ? qrId.slice(ABACATE_PREFIX.length) : "";
  if (!pixIdSchema.safeParse(id).success || !config.apiKey) return null;
  const checked = z.object({ success, error: z.null().optional(), data: z.object({ id: pixIdSchema, status: z.string() }) }).safeParse(
    await request(`check?id=${encodeURIComponent(id)}`, config));
  if (!checked.success || checked.data.data.id !== id || checked.data.data.status !== "PAID") return null;
  const full = payment(await request(`get?id=${encodeURIComponent(id)}`, config));
  return full && full.id === id && full.status === "PAID" && matches(full, opts, config) ? qrId : null;
}