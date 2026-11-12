// Wyvi Pay é o intermediador oficial dos novos Pix.
// Asaas permanece SOMENTE na consulta de pedidos históricos já emitidos.
const WY_V1 = "https://api.wyvipay.com.br/api/v1";
const WY_V2 = "https://api.wyvipay.com.br/api/v2";
type WyviVersion = "v1" | "v2";
export type PixCharge = { id: string; payload: string; image: string | null };

const wyKey = () => process.env["WIVYPAY_API_KEY"] || null;

export function parseWyviPixResponse(body: unknown): PixCharge | null {
  if (!body || typeof body !== "object") return null;
  const root = body as { txid?: unknown; copia_e_cola?: unknown; pix?: { copia_e_cola?: unknown; qrcode?: unknown }; data?: unknown };
  const data = root.data && typeof root.data === "object" ? root.data as typeof root : root;
  const txid = data.txid;
  const payload = data.pix?.copia_e_cola ?? data.copia_e_cola;
  if (typeof txid !== "string" || !/^[a-z0-9_-]{8,120}$/i.test(txid) ||
      typeof payload !== "string" || !payload.startsWith("000201") || payload.length > 5000) return null;
  const image = typeof data.pix?.qrcode === "string" && data.pix.qrcode.startsWith("data:image/png;base64,")
    ? data.pix.qrcode.slice("data:image/png;base64,".length) : null;
  return { id: `wy:${txid}`, payload, image };
}

/** Gerar Pix não movimenta dinheiro. Idempotency-Key = pedido: retentativas não criam cobrança diferente. */
/** Códigos seguros para diagnóstico; nunca incluir a resposta bruta da Wyvi. */
export type WyviIssue = { status: number; code: string };
export type WyviPixResult = { charge: PixCharge | null; issue: WyviIssue | null };
function safeIssueCode(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : "unknown";
}

/** Uma única tentativa de emissão: devolve a causa técnica sem expor chave nem dados privados. */
export async function createAsaasPixDetailed(
  opts: { orderId: string; orderCode: string; valueCents: number; apiVersion?: WyviVersion },
): Promise<WyviPixResult> {
  const key = wyKey();
  if (!key) {
    console.warn("[wyvi] create disabled: missing API key");
    return { charge: null, issue: { status: 0, code: "missing_api_key" } };
  }
  const version = opts.apiVersion === "v1" ? "v1" : "v2";
  const body = version === "v1"
    ? { valor_centavos: opts.valueCents, descricao: `Caminho das Cartas ${opts.orderCode}`, referencia: opts.orderId, expiracao_segundos: 86_400 }
    : { valor_centavos: opts.valueCents, descricao: `Caminho das Cartas ${opts.orderCode}`, referencia: opts.orderId, expira_em_segundos: 86_400 };
  try {
    const response = await fetch(`${version === "v1" ? WY_V1 : WY_V2}/cobrancas`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `pedido-${opts.orderId}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) {
      let rawCode: unknown = null;
      try {
        const err = await response.json() as {
          erro?: { codigo?: unknown };
          error?: { codigo?: unknown };
          codigo?: unknown;
        };
        rawCode = err.erro?.codigo ?? err.error?.codigo ?? err.codigo;
      } catch {}
      const issue = { status: response.status, code: safeIssueCode(rawCode) };
      console.warn("[wyvi] emission rejected", { version, status: issue.status, code: issue.code });
      return { charge: null, issue };
    }
    let decoded: unknown;
    try { decoded = await response.json(); }
    catch {
      console.warn("[wyvi] non-JSON response", { version, status: response.status });
      return { charge: null, issue: { status: response.status, code: "response_not_json" } };
    }
    const charge = parseWyviPixResponse(decoded);
    if (!charge) {
      console.warn("[wyvi] unexpected response shape", { version, status: response.status });
      return { charge: null, issue: { status: response.status, code: "invalid_pix_payload" } };
    }
    return { charge, issue: null };
  } catch (e) {
    const kind = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network_error";
    console.warn("[wyvi] emission network failure", { version, kind });
    return { charge: null, issue: { status: 0, code: kind } };
  }
}

/** Mantida a interface antiga usada nos testes e em outras rotinas. */
export async function createAsaasPix(
  opts: { orderId: string; orderCode: string; valueCents: number; apiVersion?: WyviVersion },
): Promise<PixCharge | null> {
  return (await createAsaasPixDetailed(opts)).charge;
}

async function findWyviPayment(key: string, txid: string, valueCents: number): Promise<string | null> {
  // v2 lê cobranças v1 e v2. Se uma cobrança histórica não aparecer, tente v1.
  for (const version of ["v2", "v1"] as const) {
    const r = await fetch(`${version === "v2" ? WY_V2 : WY_V1}/cobrancas/${encodeURIComponent(txid)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (r.status === 404 && version === "v2") continue;
    if (!r.ok) { console.warn("[wyvi] lookup failed", { version, status: r.status }); return null; }
    const j = await r.json() as { situacao?: string; valor_centavos?: number; data?: { situacao?: string; valor_centavos?: number } };
    const d = j.situacao ? j : (j.data ?? {});
    return d.situacao === "concluida" && (d.valor_centavos ?? 0) >= valueCents ? `wy:${txid}` : null;
  }
  return null;
}

/** Consulta histórica Asaas apenas, novos Pix sempre passam pela Wyvi. */
function legacyAsaasConfig() {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) return null;
  const base = key.includes("hmlg") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  return { base, headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "CaminhoDasCartas" } };
}
export async function findAsaasPayment(qrId: string, valueCents: number): Promise<string | null> {
  if (qrId.startsWith("wy:")) {
    const key = wyKey();
    return key ? findWyviPayment(key, qrId.slice(3), valueCents) : null;
  }
  const c = legacyAsaasConfig();
  if (!c) return null;
  const r = await fetch(`${c.base}/payments?pixQrCodeId=${encodeURIComponent(qrId)}&limit=10`, { headers: c.headers });
  if (!r.ok) { console.warn("[asaas] historic lookup failed", r.status); return null; }
  const j = await r.json() as { data?: { id: string; pixQrCodeId?: string; status: string; value: number }[] };
  const paid = (j.data ?? []).find(p => p.pixQrCodeId === qrId &&
    ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status) &&
    Math.round(p.value * 100) >= valueCents);
  return paid?.id ?? null;
}
