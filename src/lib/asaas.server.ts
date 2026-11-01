// Asaas Pix integration (server-only). One dynamic-value Pix QR per order; payment is detected by polling.
function cfg() {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) return null;
  const base = key.includes("hmlg") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  return { base, headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "CaminhoDasCartas" } };
}

export async function createAsaasPix(opts: { orderId: string; orderCode: string; valueCents: number }) {
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
  const c = cfg();
  if (!c) return null;
  const r = await fetch(`${c.base}/payments?pixQrCodeId=${encodeURIComponent(qrId)}&limit=10`, { headers: c.headers });
  if (!r.ok) { console.error("[asaas] payments lookup failed", r.status); return null; }
  const j = (await r.json()) as { data?: { id: string; pixQrCodeId?: string; status: string; value: number }[] };
  const hit = (j.data ?? []).find((p) => p.pixQrCodeId === qrId && ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status) && Math.round(p.value * 100) >= valueCents);
  return hit?.id ?? null;
}
