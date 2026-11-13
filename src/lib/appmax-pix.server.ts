/**
 * Appmax API — preparação SEM ATIVAÇÃO no checkout público.
 *
 * Fluxo oficial: token MERCHANT -> criar cliente -> criar pedido -> Pix.
 * Os passos são separados para permitir persistir cada ID no banco antes
 * da próxima requisição e evitar pedidos/cobranças duplicados após falhas.
 *
 * Docs: https://docs.appmax.com.br/api-reference/introduction
 *       https://docs.appmax.com.br/api-reference/payments/pix
 */
export type AppmaxEnvironment = "sandbox" | "production";
export type AppmaxMerchantConfig = {
  environment: AppmaxEnvironment;
  clientId: string;
  clientSecret: string;
};
export type AppmaxBuyer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  documentNumber: string;
  /** Deve ser recolhido pelo Appmax JS no checkout (não derivado de logs). */
  appmaxIp: string;
};
export type AppmaxProduct = {
  sku: string;
  name: string;
  valueCents: number;
};
export type AppmaxPix = {
  appmaxOrderId: number;
  payload: string;
  image: string | null;
  expiresAt: string | null;
};
export type AppmaxOrderStatus = {
  appmaxOrderId: number;
  status: string;
  totalPaidCents: number | null;
};

export class AppmaxApiError extends Error {
  constructor(
    public readonly step: "config" | "auth" | "customer" | "order" | "pix" | "lookup",
    public readonly status: number,
  ) {
    super(`Não foi possível concluir a etapa Appmax: ${step} (HTTP ${status}).`);
    this.name = "AppmaxApiError";
  }
}

/** Falha fechada: nenhum ambiente/credencial é assumido como produção. */
export function readAppmaxConfig(env: NodeJS.ProcessEnv = process.env): AppmaxMerchantConfig | null {
  const environment = env["APPMAX_ENV"];
  const clientId = env["APPMAX_MERCHANT_CLIENT_ID"];
  const clientSecret = env["APPMAX_MERCHANT_CLIENT_SECRET"];
  if ((environment !== "sandbox" && environment !== "production") || !clientId || !clientSecret) return null;
  return { environment, clientId, clientSecret };
}
function baseUrls(environment: AppmaxEnvironment) {
  return environment === "production"
    ? { auth: "https://auth.appmax.com.br", api: "https://api.appmax.com.br" }
    : { auth: "https://auth.sandboxappmax.com.br", api: "https://api.sandboxappmax.com.br" };
}
function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function digits(value: string) { return value.replace(/\D/g, ""); }
export function validAppmaxBuyer(buyer: AppmaxBuyer): boolean {
  return buyer.firstName.trim().length >= 2 && buyer.lastName.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)
    && /^\d{10,11}$/.test(digits(buyer.phone))
    && /^(\d{11}|\d{14})$/.test(digits(buyer.documentNumber))
    && buyer.appmaxIp.trim().length >= 7 && buyer.appmaxIp.length <= 64;
}
export function parseAppmaxPix(body: unknown, expectedOrderId: number): AppmaxPix | null {
  const data = object(object(body).data);
  const payment = object(data.payment);
  const pix = object(data.pix);
  const returnedOrder = object(data.order);
  const id = returnedOrder.id == null ? expectedOrderId : positiveId(returnedOrder.id);
  if (id !== expectedOrderId) return null;
  const payload = payment.pix_emv ?? pix.emv_code;
  const img = payment.pix_qrcode ?? pix.qr_code;
  const expiration = payment.pix_expiration_date ?? pix.expires_at;
  if (typeof payload !== "string" || !payload.startsWith("000201") || payload.length > 5000) return null;
  let image: string | null = null;
  if (typeof img === "string" && img.length <= 250000) {
    const value = img.startsWith("data:image/png;base64,") ? img.slice("data:image/png;base64,".length) : img;
    if (/^[A-Za-z0-9+/=]+$/.test(value)) image = value;
  }
  return { appmaxOrderId: expectedOrderId, payload, image, expiresAt: typeof expiration === "string" ? expiration : null };
}
export function parseAppmaxStatus(body: unknown, expectedOrderId: number): AppmaxOrderStatus | null {
  const order = object(object(body).data).order;
  const data = object(order);
  const id = positiveId(data.id);
  if (id !== expectedOrderId || typeof data.status !== "string") return null;
  const total = data.total_paid;
  return {
    appmaxOrderId: expectedOrderId, status: data.status,
    totalPaidCents: typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : null,
  };
}
export function isConfirmedAppmaxPix(order: AppmaxOrderStatus, expectedOrderId: number, expectedCents: number) {
  return order.appmaxOrderId === expectedOrderId &&
    (order.status === "aprovado" || order.status === "integrado") &&
    order.totalPaidCents !== null && order.totalPaidCents >= expectedCents &&
    Number.isSafeInteger(expectedCents) && expectedCents > 0;
}

/** Injeção do fetch nos testes: nenhuma chamada a pagamentos reais. */
type FetchLike = typeof fetch;
export async function appmaxMerchantToken(config: AppmaxMerchantConfig, fetcher: FetchLike = fetch): Promise<string> {
  const url = baseUrls(config.environment).auth + "/oauth2/token";
  const params = new URLSearchParams({
    grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret,
  });
  let res: Response;
  try {
    res = await fetcher(url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params, signal: AbortSignal.timeout(12000),
    });
  } catch { throw new AppmaxApiError("auth", 0); }
  if (!res.ok) throw new AppmaxApiError("auth", res.status);
  let response: unknown;
  try { response = await res.json(); } catch { throw new AppmaxApiError("auth", 0); }
  const token = object(response).access_token;
  if (typeof token !== "string" || token.length < 16) throw new AppmaxApiError("auth", 0);
  return token;
}
async function requestAppmax(
  config: AppmaxMerchantConfig, token: string, step: AppmaxApiError["step"],
  path: string, method: "POST" | "GET", payload: unknown, fetcher: FetchLike,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(baseUrls(config.environment).api + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AppmaxApiError(step, 0); }
  if (!response.ok) throw new AppmaxApiError(step, response.status);
  try { return await response.json(); } catch { throw new AppmaxApiError(step, 0); }
}

/**
 * Necessita nome, email, telefone, CPF/CNPJ e IP do Appmax JS.
 * Não armazenar PII em pedidos de tarot nem repassar à MandAPI.
 */
export async function appmaxCreateCustomer(
  config: AppmaxMerchantConfig, token: string, buyer: AppmaxBuyer, fetcher: FetchLike = fetch,
): Promise<number> {
  if (!validAppmaxBuyer(buyer)) throw new AppmaxApiError("customer", 0);
  const response = await requestAppmax(config, token, "customer", "/v1/customers", "POST", {
    first_name: buyer.firstName.trim(), last_name: buyer.lastName.trim(),
    email: buyer.email.trim(), phone: digits(buyer.phone),
    document_number: digits(buyer.documentNumber), ip: buyer.appmaxIp.trim(),
  }, fetcher);
  const id = positiveId(object(object(response).data).customer && object(object(object(response).data).customer).id);
  if (!id) throw new AppmaxApiError("customer", 0);
  return id;
}

/** Persistir customer_id antes de chamar esta etapa. */
export async function appmaxCreateOrder(
  config: AppmaxMerchantConfig, token: string, customerId: number, product: AppmaxProduct,
  fetcher: FetchLike = fetch,
): Promise<number> {
  if (!positiveId(customerId) || !Number.isSafeInteger(product.valueCents) || product.valueCents <= 0 ||
      !/^[A-Z0-9_-]{3,30}$/.test(product.sku) || product.name.trim().length < 3) throw new AppmaxApiError("order", 0);
  const response = await requestAppmax(config, token, "order", "/v1/orders", "POST", {
    customer_id: customerId, products_value: product.valueCents, discount_value: 0, shipping_value: 0,
    products: [{ sku: product.sku, name: product.name, quantity: 1, unit_value: product.valueCents, type: "digital" }],
  }, fetcher);
  const id = positiveId(object(object(object(response).data).order).id);
  if (!id) throw new AppmaxApiError("order", 0);
  return id;
}

/** Persistir order_id ANTES de gerar o Pix; não repetir automaticamente se a resposta se perder. */
export async function appmaxCreatePix(
  config: AppmaxMerchantConfig, token: string, orderId: number, documentNumber: string, fetcher: FetchLike = fetch,
): Promise<AppmaxPix> {
  if (!positiveId(orderId) || !/^(\d{11}|\d{14})$/.test(digits(documentNumber))) throw new AppmaxApiError("pix", 0);
  const response = await requestAppmax(config, token, "pix", "/v1/payments/pix", "POST", {
    order_id: orderId, payment_data: { pix: { document_number: digits(documentNumber) } },
  }, fetcher);
  const pix = parseAppmaxPix(response, orderId);
  if (!pix) throw new AppmaxApiError("pix", 0);
  return pix;
}

/** Conferir status e valor no servidor antes de marcar pedido local como pago. */
export async function appmaxLookupOrder(
  config: AppmaxMerchantConfig, token: string, orderId: number, fetcher: FetchLike = fetch,
): Promise<AppmaxOrderStatus> {
  if (!positiveId(orderId)) throw new AppmaxApiError("lookup", 0);
  const response = await requestAppmax(config, token, "lookup", `/v1/orders/${orderId}`, "GET", undefined, fetcher);
  const status = parseAppmaxStatus(response, orderId);
  if (!status) throw new AppmaxApiError("lookup", 0);
  return status;
}
