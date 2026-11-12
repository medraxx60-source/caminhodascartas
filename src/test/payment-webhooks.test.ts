import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPaymentLookup, handlePaymentWebhook, verifyPaymentWebhook } from "@/lib/payment-webhooks.server";

afterEach(() => vi.unstubAllEnvs());

describe("webhooks de pagamento assinados", () => {
  const asaas = "asaas-token-of-at-least-16-chars";
  it("bloqueia Asaas sem token e permite apenas token igual ao configurado", async () => {
    const h = new Headers({ "asaas-access-token": asaas });
    expect(await verifyPaymentWebhook("asaas", h, "{}", { ASAAS_WEBHOOK_TOKEN: asaas })).toBe(true);
    expect(await verifyPaymentWebhook("asaas", h, "{}", { ASAAS_WEBHOOK_TOKEN: "some-other-token-long-enough" })).toBe(false);
    expect(await verifyPaymentWebhook("asaas", h, "{}", {})).toBe(false);
  });
  it("confere assinatura HMAC e janela de cinco minutos do Wyvi Pay", async () => {
    const secret = "whsec_a-secure-test-secret-123";
    const raw = JSON.stringify({ evento: "cobranca.paga", dados: { txid: "ab12345678" } });
    const now = Date.UTC(2026, 10, 12, 12);
    const timestamp = String(Math.floor(now / 1000));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
    const hex = Array.from(new Uint8Array(signed), b => b.toString(16).padStart(2, "0")).join("");
    const h = new Headers({ "x-wyvi-carimbo": timestamp, "x-wyvi-assinatura": `v1=${hex}` });
    expect(await verifyPaymentWebhook("wyvi", h, raw, { WIVYPAY_WEBHOOK_SECRET: secret }, now)).toBe(true);
    expect(await verifyPaymentWebhook("wyvi", h, raw+" ", { WIVYPAY_WEBHOOK_SECRET: secret }, now)).toBe(false);
    expect(await verifyPaymentWebhook("wyvi", h, raw, { WIVYPAY_WEBHOOK_SECRET: secret }, now + 301000)).toBe(false);
  });
  it("seleciona apenas eventos de pagamento e identificadores válidos", () => {
    expect(extractPaymentLookup("asaas", { event: "PAYMENT_RECEIVED", payment: { pixQrCodeId: "qrc_ab1234" } })).toEqual({ qrId: "qrc_ab1234" });
    expect(extractPaymentLookup("wyvi", { evento: "cobranca.paga", dados: { txid: "txid12345678" } })).toEqual({ qrId: "wy:txid12345678" });
    expect(extractPaymentLookup("asaas", { event: "PAYMENT_REFUNDED" })).toBeNull();
    expect(extractPaymentLookup("wyvi", { evento: "cobranca.expirada" })).toBeNull();
  });
  it("rejeita notificação sem assinatura sem consultar banco nem confirmar pedido", async () => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
    const r = await handlePaymentWebhook(new Request("https://example.com/api/webhooks/asaas", {
      method: "POST", body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { pixQrCodeId: "qrc_12345" } })
    }), "asaas");
    expect(r.status).toBe(401);
  });
});
