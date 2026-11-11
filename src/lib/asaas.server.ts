// Asaas Pix integration (server-only). One dynamic-value Pix QR per order; payment is detected by polling.
function cfg() {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) return null;
  const base = key.includes("hmlg") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  return { base, headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "CaminhoDasCartas" } };
}

// Wyvi Pay (preferred when WIVYPAY_API_KEY is set). Ids are stored prefixed "wy:" so lookups know the provider.
const WY = "https://api.wyvipay.com.br/api/v1";
function wyKey() { return process.env["WIVYPAY_API_KEY"] || null; }

async function createWyviPix(key: string, opts: { orderId: string; orderCode: string; valueCents: number }) {
  const r = await fetch(`${WY}/cobrancas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `pedido-${opts.orderId}` },
    body: JSON.stringify({ valor_centavos: opts.valueCents, descricao: `Caminho das Cartas ${opts.orderCode}`, referencia: opts.orderId, expiracao_segundos: 24 * 60 * 60 }),
  });
  if (!r.ok) { console.error("[wyvi] create failed", r.status, await r.text()); return null; }
  const j = (await r.json()) as { txid?: string; copia_e_cola?: string; data?: { txid?: string; copia_e_cola?: string } };
  const d = j.txid ? j : (j.data ?? {});
  if (!d.txid || !d.copia_e_cola) { console.error("[wyvi] unexpected response"); return null; }
  return { id: `wy:${d.txid}`, payload: d.copia_e_cola, image: null as string | null };
}

async function findWyviPayment(key: string, txid: string, valueCents: number) {
  const r = await fetch(`${WY}/cobrancas/${encodeURIComponent(txid)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) { console.error("[wyvi] lookup failed", r.status); return null; }
  const j = (await r.json()) as { situacao?: string; valor_centavos?: number; data?: { situacao?: string; valor_centavos?: number } };
  const d = j.situacao ? j : (j.data ?? {});
  return d.situacao === "concluida" && (d.valor_centavos ?? 0) >= valueCents ? `wy:${txid}` : null;
}

export async function createAsaasPix(opts: { orderId: string; orderCode: string; valueCents: number }) {
  const wk = wyKey();
  if (wk) return createWyviPix(wk, opts);
  const c = cfg();
  if (!c) return null;
  const r = await fetch(`${c.base}/pix/qrCodes/static`, {
    method: "POST",
    headers: c.headers,
    body: JSON.stringify({
      description: `Caminho das Cartas ${opts.orderCode}`,
      value: opts.valueCents / 100,
      format: "ALL",
      expirationSeconds: 24 * 60 * 60,
      allowsMultiplePayments: false,
      externalReference: opts.orderId,
    }),
  });
  if (!r.ok) { console.error("[asaas] qr create failed", r.status, await r.text()); return null; }
  const j = (await r.json()) as { id: string; payload: string; encodedImage: string | null };
  return { id: j.id, payload: j.payload, image: j.encodedImage };
}

/** Returns the Asaas payment id when the QR has a received payment of at least the expected value. */
export async function findAsaasPayment(qrId: string, valueCents: number): Promise<string | null> {
  if (qrId.startsWith("wy:")) { const wk = wyKey(); return wk ? findWyviPayment(wk, qrId.slice(3), valueCents) : null; }
  const c = cfg();
  if (!c) return null;
  const r = await fetch(`${c.base}/payments?pixQrCodeId=${encodeURIComponent(qrId)}&limit=10`, { headers: c.headers });
  if (!r.ok) { console.error("[asaas] payments lookup failed", r.status); return null; }
  const j = (await r.json()) as { data?: { id: string; pixQrCodeId?: string; status: string; value: number }[] };
  const hit = (j.data ?? []).find((p) => p.pixQrCodeId === qrId && ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status) && Math.round(p.value * 100) >= valueCents);
  return hit?.id ?? null;
}
