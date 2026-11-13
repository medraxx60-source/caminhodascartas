import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppmaxApiError, appmaxCreateCustomer, appmaxCreateOrder, appmaxCreatePix,
  appmaxLookupOrder, appmaxMerchantToken, isConfirmedAppmaxPix,
  parseAppmaxPix, parseAppmaxStatus, readAppmaxConfig, validAppmaxBuyer,
  type AppmaxBuyer, type AppmaxMerchantConfig,
} from "@/lib/appmax-pix.server";

const config: AppmaxMerchantConfig = { environment: "sandbox", clientId: "id_de_teste", clientSecret: "secret_de_teste" };
const buyer: AppmaxBuyer = {
  firstName: "Pessoa", lastName: "Exemplo", email: "pessoa@example.com",
  phone: "63999999999", documentNumber: "19100000000", appmaxIp: "192.0.2.1",
};
const emv = "00020101021226930014br.gov.bcb.pix52040000530398654048.905802BR5908APPMAX6009SAO PAULO6304ABCD";
const fakeResponse = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("integração Appmax preparada, não ativada em produção", () => {
  it("exige ambiente declarado e o par de credenciais do merchant", () => {
    expect(readAppmaxConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(readAppmaxConfig({ APPMAX_MERCHANT_CLIENT_ID: "i", APPMAX_MERCHANT_CLIENT_SECRET: "s" } as NodeJS.ProcessEnv)).toBeNull();
    expect(readAppmaxConfig({ APPMAX_ENV: "sandbox", APPMAX_MERCHANT_CLIENT_ID: "i", APPMAX_MERCHANT_CLIENT_SECRET: "s" } as NodeJS.ProcessEnv))
      .toEqual({ environment: "sandbox", clientId: "i", clientSecret: "s" });
  });
  it("autentica com credenciais merchant somente no domínio de sandbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ access_token: "token_longo_de_teste_1234", expires_in: 3600 }));
    const token = await appmaxMerchantToken(config, fetchMock as typeof fetch);
    expect(token).toBe("token_longo_de_teste_1234");
    const [url, req] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://auth.sandboxappmax.com.br/oauth2/token");
    expect(req.method).toBe("POST");
    const payload = req.body as URLSearchParams;
    expect(payload.get("client_id")).toBe("id_de_teste");
    expect(payload.get("client_secret")).toBe("secret_de_teste");
  });
  it("valida entradas de pagador reais e não aceita dados inventados pela integração", () => {
    expect(validAppmaxBuyer(buyer)).toBe(true);
    expect(validAppmaxBuyer({ ...buyer, documentNumber: "" })).toBe(false);
    expect(validAppmaxBuyer({ ...buyer, email: "invalido" })).toBe(false);
    expect(validAppmaxBuyer({ ...buyer, appmaxIp: "" })).toBe(false);
  });
  it("cria cliente com campos documentados sem incluir pergunta da consulta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { customer: { id: 32 } } }, 201));
    expect(await appmaxCreateCustomer(config, "token", buyer, fetchMock as typeof fetch)).toBe(32);
    const [url, req] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.sandboxappmax.com.br/v1/customers");
    const payload = JSON.parse(req.body);
    expect(payload).toEqual({
      first_name: "Pessoa", last_name: "Exemplo", email: "pessoa@example.com",
      phone: "63999999999", document_number: "19100000000", ip: "192.0.2.1",
    });
    expect(payload).not.toHaveProperty("question");
  });
  it("gera pedido digital com valor inteiro em centavos e sem frete", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { order: { id: 128, status: "pendente" } } }, 201));
    expect(await appmaxCreateOrder(config, "token", 32, { sku: "CARTAS-5", name: "Leitura de 5 cartas", valueCents: 890 }, fetchMock as typeof fetch))
      .toBe(128);
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(request.products_value).toBe(890);
    expect(request.shipping_value).toBe(0);
    expect(request.products).toEqual([{
      sku: "CARTAS-5", name: "Leitura de 5 cartas", quantity: 1, unit_value: 890, type: "digital",
    }]);
  });
  it("gera Pix no order_id já criado, com documento do pagador, sem segundo pedido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { payment: { pix_emv: emv, pix_qrcode: "aW1n", pix_expiration_date: "2026-11-13 00:00:00" } } }));
    const result = await appmaxCreatePix(config, "token", 128, buyer.documentNumber, fetchMock as typeof fetch);
    expect(result).toEqual({ appmaxOrderId: 128, payload: emv, image: "aW1n", expiresAt: "2026-11-13 00:00:00" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, req] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.sandboxappmax.com.br/v1/payments/pix");
    expect(JSON.parse(req.body)).toEqual({ order_id: 128, payment_data: { pix: { document_number: "19100000000" } } });
  });
  it("lê tanto o formato Pix da referência quanto o do quickstart, sem duplicar base64", () => {
    expect(parseAppmaxPix({ data: { order: { id: 128 }, pix: { qr_code: "data:image/png;base64,aW1n", emv_code: emv, expires_at: "amanha" } } }, 128))
      .toEqual({ appmaxOrderId: 128, payload: emv, image: "aW1n", expiresAt: "amanha" });
    expect(parseAppmaxPix({ data: { order: { id: 200 }, payment: { pix_emv: emv } } }, 128)).toBeNull();
    expect(parseAppmaxPix({ data: { payment: { pix_emv: "invalid" } } }, 128)).toBeNull();
  });
  it("consulta o pedido e só marca pagamento quando status, id e valor são válidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ data: { order: { id: 128, status: "aprovado", total_paid: 890 } } }));
    const status = await appmaxLookupOrder(config, "token", 128, fetchMock as typeof fetch);
    expect(status).toEqual({ appmaxOrderId: 128, status: "aprovado", totalPaidCents: 890 });
    expect(isConfirmedAppmaxPix(status, 128, 890)).toBe(true);
    expect(isConfirmedAppmaxPix(status, 128, 1490)).toBe(false);
    expect(isConfirmedAppmaxPix({ ...status, appmaxOrderId: 129 }, 128, 890)).toBe(false);
    expect(isConfirmedAppmaxPix({ ...status, status: "pendente" }, 128, 890)).toBe(false);
    expect(isConfirmedAppmaxPix({ ...status, totalPaidCents: null }, 128, 890)).toBe(false);
  });
  it("não confia em resposta com outro ID nem em valor de pagamento ausente", () => {
    expect(parseAppmaxStatus({ data: { order: { id: 129, status: "aprovado", total_paid: 890 } } }, 128)).toBeNull();
    expect(parseAppmaxStatus({ data: { order: { id: 128, status: "aprovado" } } }, 128))
      .toEqual({ appmaxOrderId: 128, status: "aprovado", totalPaidCents: null });
  });
  it("não vaza credenciais nem dados pessoais em mensagens de erros API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ error: { message: "cliente@example.com e cpf" } }, 422));
    await expect(appmaxCreateCustomer(config, "secret", buyer, fetchMock as typeof fetch))
      .rejects.toThrow("HTTP 422");
    await expect(appmaxCreateCustomer(config, "secret", buyer, fetchMock as typeof fetch))
      .rejects.toBeInstanceOf(AppmaxApiError);
  });
});
