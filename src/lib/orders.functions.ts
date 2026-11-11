import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CARDS, CATEGORIES, PLANS, type PlanId } from "./lenormand";

const IP_LIMIT = 20; // orders per IP per window
const GLOBAL_LIMIT = 300; // orders per window across all clients
const WINDOW_MS = 60 * 60 * 1000;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { plan: PlanId; category?: string; question: string; cards: number[] }) => {
    const plan = PLANS[input.plan];
    if (!plan) throw new Error("Plano inválido");
    const question = String(input.question ?? "").trim();
    if (question.length < 5 || question.length > 1000) throw new Error("Pergunta deve ter entre 5 e 1000 caracteres");
    const cards = Array.isArray(input.cards) ? input.cards.map(Number) : [];
    if (cards.length !== plan.count || new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c >= CARDS.length))
      throw new Error("Seleção de cartas inválida");
    const category = (CATEGORIES as readonly string[]).includes(String(input.category)) ? String(input.category) : null;
    return { plan: input.plan, category, question, cards };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await sha256(`entre-cartas:${ip}`);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const [{ count: ipCount }, { count: allCount }] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("client_ip_hash", ipHash).gte("created_at", since),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    if ((ipCount ?? 0) >= IP_LIMIT) throw new Error("Muitos pedidos em pouco tempo. Tente novamente em 1 hora.");
    if ((allCount ?? 0) >= GLOBAL_LIMIT) throw new Error("Estamos com alta demanda. Tente novamente em alguns minutos.");

    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({ plan: data.plan, category: data.category, question: data.question, cards: data.cards, price_cents: PLANS[data.plan].priceCents, client_ip_hash: ipHash })
      .select("id, access_token")
      .single();
    if (error || !row) {
      console.error("[createOrder] insert failed:", error?.code, error?.message);
      throw new Error("Não foi possível criar o pedido");
    }
    const orderCode = row.id.slice(0, 8).toUpperCase();
    let pix: { payload: string; image: string | null } | null = null;
    try {
      const { createAsaasPix } = await import("./asaas.server");
      const q = await createAsaasPix({ orderId: row.id, orderCode, valueCents: PLANS[data.plan].priceCents });
      if (q) {
        pix = { payload: q.payload, image: q.image };
        await (supabaseAdmin.from("orders") as any).update({ asaas_qr_id: q.id, pix_payload: q.payload, pix_qr_image: q.image }).eq("id", row.id);
      }
    } catch (e) { console.error("[asaas] create", e); }
    try {
      const lk = process.env["LOVABLE_API_KEY"];
      const tk = process.env["TELEGRAM_API_KEY"];
      const chats = (process.env["TELEGRAM_CHAT_IDS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (lk && tk && chats.length) {
        const p = PLANS[data.plan];
        const price = (p.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const text = `🔔 Novo pedido aguardando aprovação\n\nCódigo: ${orderCode}\nPlano: ${p.name} (${price})\n\nO Pix é confirmado automaticamente. Painel:\nhttps://entre-cartas.lovable.app/admin`;
        await Promise.all(chats.map((chat_id) =>
          fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": tk, "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id, text }),
          }).then(async (r) => { if (!r.ok) console.error("[telegram]", r.status, await r.text()); }),
        ));
      }
    } catch (e) {
      console.error("[telegram] notify failed", e);
    }
    return { token: row.access_token, orderCode, pixPayload: pix?.payload ?? null, pixImage: pix?.image ?? null };
  });

export const getOrderByToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Recover a paid Asaas order whose generation stalled or failed.
    await syncAsaasPayment(data.token).catch((e) => console.error("[asaas] sync", e));
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select("plan, question, cards, status, reading, price_cents, created_at, is_free, category")
      .eq("access_token", data.token)
      .maybeSingle();
    if (row) {
      const stage = row.status === "done" ? "reading" : "waiting";
      await supabaseAdmin.from("orders").update({ client_stage: stage, stage_updated_at: new Date().toISOString() })
        .eq("access_token", data.token).neq("client_stage", "reading");
    }
    const s = row?.status;
    const status: "done" | "rejected" | "generating" | "pending" | "error" =
      s === "done" ? "done" : s === "rejected" ? "rejected" : s === "generating" ? "generating" : s === "error" && row?.is_free ? "error" : "pending";
    return row ? { ...row, status } : null;
  });

// Checks Asaas for a received Pix and, if paid, marks the order and generates the reading (no admin needed).
async function syncAsaasPayment(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin.from("orders") as any;
  const { data: o } = await db.select("id, plan, cards, question, category, status, price_cents, asaas_qr_id, asaas_payment_id, generation_started_at, is_free").eq("access_token", token).maybeSingle();
  if (!o || o.is_free || !o.asaas_qr_id) return;
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  if (o.status === "pending") {
    const { findAsaasPayment } = await import("./asaas.server");
    const payId = await findAsaasPayment(o.asaas_qr_id, o.price_cents);
    if (!payId) return;
  } else if (!(o.asaas_payment_id && (o.status === "error" || (o.status === "generating" && o.generation_started_at < staleBefore)))) return;
  const { findAsaasPayment } = await import("./asaas.server");
  const payId = o.asaas_payment_id ?? (await findAsaasPayment(o.asaas_qr_id, o.price_cents));
  if (!payId) return;
  const now = new Date().toISOString();
  const { data: locked } = await (supabaseAdmin.from("orders") as any)
    .update({ status: "generating", paid_at: now, asaas_payment_id: payId, generation_started_at: now, error_message: null })
    .eq("id", o.id).is("reading", null)
    .or(`status.in.(pending,error),and(status.eq.generating,generation_started_at.lt.${staleBefore})`)
    .select("id").maybeSingle();
  if (!locked) return;
  try {
    const { generateReadingText } = await import("./reading-ai.server");
    const reading = await generateReadingText({ id: o.id, plan: o.plan, cards: o.cards as number[], question: o.question, category: o.category ?? null });
    await supabaseAdmin.from("orders").update({ status: "done", reading, completed_at: new Date().toISOString(), error_message: null }).eq("id", o.id);
  } catch (e) {
    await supabaseAdmin.from("orders").update({ status: "error", error_message: e instanceof Error ? e.message : "falha" }).eq("id", o.id).is("reading", null);
  }
}

export const getOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const read = () => (supabaseAdmin.from("orders") as any).select("status, payment_nudged_at, pix_payload, pix_qr_image").eq("access_token", data.token).maybeSingle();
    let { data: row } = await read();
    if (row?.status === "pending" && row?.pix_payload) {
      await syncAsaasPayment(data.token).catch((e) => console.error("[asaas] sync", e));
      ({ data: row } = await read());
    }
    return {
      status: (row?.status as string | undefined) ?? null,
      nudgedAt: (row?.payment_nudged_at as string | null | undefined) ?? null,
      pixPayload: (row?.pix_payload as string | null | undefined) ?? null,
      pixImage: (row?.pix_qr_image as string | null | undefined) ?? null,
    };
  });

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}
async function assertAdmin(supabase: any, userId: string) {
  if (!(await isAdmin(supabase, userId))) throw new Error("Acesso negado");
}

export const adminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ isAdmin: await isAdmin(context.supabase, context.userId) }));

// One-time owner bootstrap: requires ADMIN_SETUP_CODE and works only while no admin exists.
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => ({ code: String(input.code ?? "") }))
  .handler(async ({ data, context }) => {
    const expected = process.env["ADMIN_SETUP_CODE"];
    if (!expected) throw new Error("Código de ativação não configurado");
    const [a, b] = await Promise.all([sha256(data.code), sha256(expected)]);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (diff !== 0) throw new Error("Código inválido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Já existe um administrador configurado");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error("Não foi possível ativar o administrador");
    return { ok: true };
  });

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("orders")
      .select("id, plan, question, cards, status, price_cents, created_at, paid_at, error_message, generation_started_at, reading, client_stage, stage_updated_at, access_token, is_free, payment_nudged_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Não foi possível carregar os pedidos");
    return (data as any[]).map(({ reading, ...o }: any) => ({ ...o, hasReading: !!reading }));
  });

export const adminConfirmAndGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Atomic claim in the database: admin-only, blocked when a reading exists or another generation is running.
    const { data: rows, error: claimErr } = await context.supabase.rpc("claim_order_for_generation", { _id: data.id });
    const claimed = Array.isArray(rows) ? rows[0] : null;
    if (claimErr || !claimed) throw new Error("Pedido já tem leitura, está sendo gerado agora ou não existe. Atualize a lista.");

    const { data: catRow } = await context.supabase.from("orders").select("category").eq("id", claimed.id).maybeSingle();
    let reading: string;
    try {
      const { generateReadingText } = await import("./reading-ai.server");
      reading = await generateReadingText({ id: claimed.id, plan: claimed.plan, cards: claimed.cards as number[], question: claimed.question, category: catRow?.category ?? null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha de conexão com a MandAPI.";
      await context.supabase.from("orders").update({ status: "error", error_message: msg }).eq("id", claimed.id).is("reading", null);
      throw new Error(msg);
    }

    // Save with retries; never lose a paid response.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await context.supabase
        .from("orders")
        .update({ status: "done", reading, completed_at: new Date().toISOString(), error_message: null })
        .eq("id", claimed.id);
      if (!error) return { ok: true as const, unsavedReading: null };
      console.error(`[orders] save reading failed order=${claimed.id} attempt=${attempt + 1} code=${error.code}`);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    return { ok: false as const, unsavedReading: reading };
  });

// Saves a reading the admin already received but could not be stored (no new AI call).
export const adminSaveReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reading: string }) => {
    const reading = String(input.reading ?? "").trim();
    if (!reading) throw new Error("Leitura vazia");
    return { id: input.id, reading };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("orders")
      .update({ status: "done", reading: data.reading, completed_at: new Date().toISOString(), error_message: null })
      .eq("id", data.id)
      .is("reading", null)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Não foi possível salvar (o pedido já pode ter leitura).");
    return { ok: true };
  });

// Admin rejects an order (no AI call). Only allowed while no reading exists.
export const adminRejectOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("orders")
      .update({ status: "rejected", error_message: null })
      .eq("id", data.id)
      .is("reading", null)
      .in("status", ["pending", "error"])
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Não foi possível recusar (o pedido pode já estar em geração ou concluído).");
    return { ok: true };
  });

// Admin tells a waiting client their Pix has not arrived yet (shown live on the Pix screen).
export const adminNudgePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id ?? "") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("orders")
      .update({ payment_nudged_at: new Date().toISOString() } as any)
      .eq("id", data.id)
      .eq("status", "pending")
      .eq("is_free", false)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Não foi possível avisar (o pedido pode não estar mais pendente).");
    return { ok: true };
  });

// ================= 1ª tiragem gratuita (isolada do fluxo pago: sem Pix, Telegram ou aprovação) =================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FREE_IP_LIMIT = 3; // tiragens grátis por rede (IP) em 30 dias — proteção complementar, não bloqueio permanente

async function clientIpHash() {
  const ip = getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return sha256(`entre-cartas:${ip}`);
}
async function freeEnabled(admin: any) {
  const { data } = await admin.from("app_settings").select("value").eq("key", "free_reading_enabled").maybeSingle();
  return data ? data.value === true : true;
}
function validDevice(id: unknown) {
  const s = String(id ?? "");
  if (!UUID_RE.test(s)) throw new Error("Identificador inválido");
  return s.toLowerCase();
}
function validFp(fp: unknown) {
  const s = String(fp ?? "");
  return /^[a-f0-9]{64}$/.test(s) ? s : null;
}

export const checkFreeReading = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string; fp?: string | undefined }) => ({ deviceId: validDevice(input.deviceId), fp: validFp(input.fp) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await freeEnabled(supabaseAdmin))) return { enabled: false, eligible: false };
    const ipHash = await clientIpHash();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ count: dev }, { count: ip }] = await Promise.all([
      supabaseAdmin.from("free_reading_claims").select("id", { count: "exact", head: true }).eq("device_id", data.deviceId).eq("status", "consumed"),
      supabaseAdmin.from("free_reading_claims").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).in("status", ["reserved", "consumed"]).gte("created_at", since),
    ]);
    // Fingerprint is not unique (same phone model = same hash); stored only for audit, never used to block.
    return { enabled: true, eligible: (dev ?? 0) === 0 && (ip ?? 0) < FREE_IP_LIMIT };
  });

const FREE_ERR: Record<string, string> = {
  already_used: "Você já aproveitou sua 1ª leitura de cortesia.",
  in_progress: "Sua leitura gratuita já está sendo preparada em outra aba.",
  ip_limit: "O limite de leituras de cortesia desta rede foi atingido.",
};
function freeError(msg?: string) {
  const k = Object.keys(FREE_ERR).find((key) => msg?.includes(key));
  return new Error(k ? FREE_ERR[k] : "Não foi possível iniciar a leitura gratuita");
}

export const createFreeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { deviceId: string; fp?: string | undefined; category?: string; question: string; cards: number[] }) => {
    const plan = PLANS.essencial;
    const question = String(input.question ?? "").trim();
    if (question.length < 5 || question.length > 1000) throw new Error("Pergunta deve ter entre 5 e 1000 caracteres");
    const cards = Array.isArray(input.cards) ? input.cards.map(Number) : [];
    if (cards.length !== plan.count || new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c >= CARDS.length))
      throw new Error("Seleção de cartas inválida");
    const category = (CATEGORIES as readonly string[]).includes(String(input.category)) ? String(input.category) : null;
    return { deviceId: validDevice(input.deviceId), fp: validFp(input.fp), category, question, cards };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await freeEnabled(supabaseAdmin))) throw new Error("A leitura de cortesia não está disponível no momento.");
    const ipHash = await clientIpHash();
    const { data: claimId, error: rErr } = await supabaseAdmin.rpc("reserve_free_reading", { _device: data.deviceId, _ip: ipHash, _ip_limit: FREE_IP_LIMIT });
    if (rErr || !claimId) throw freeError(rErr?.message);
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({ plan: "essencial", category: data.category, question: data.question, cards: data.cards, price_cents: 0, is_free: true, client_ip_hash: ipHash, client_stage: "waiting" })
      .select("id, access_token")
      .single();
    if (error || !row) {
      await supabaseAdmin.from("free_reading_claims").update({ status: "released" }).eq("id", claimId);
      throw new Error("Não foi possível criar a leitura");
    }
    await supabaseAdmin.from("free_reading_claims").update({ order_id: row.id, fingerprint: data.fp } as any).eq("id", claimId);
    return { token: row.access_token };
  });

// Gera a leitura gratuita. Só consome a gratuidade após a IA responder e o texto ser salvo.
export const runFreeGeneration = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin.from("orders").select("id, is_free, status, reading").eq("access_token", data.token).maybeSingle();
    if (!order || !order.is_free) throw new Error("Pedido inválido");
    if (order.reading) return { ok: true };
    const { data: claim } = await supabaseAdmin.from("free_reading_claims").select("id, device_id, ip_hash, status").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!claim) throw new Error("Pedido inválido");
    if (claim.status !== "reserved") {
      // Reserva anterior foi liberada (falha da IA): reserva de novo para esta mesma leitura.
      const { error } = await supabaseAdmin.rpc("reserve_free_reading", { _device: claim.device_id, _ip: claim.ip_hash, _order: order.id, _ip_limit: FREE_IP_LIMIT + 1 });
      if (error) throw freeError(error.message);
    } else {
      await supabaseAdmin.from("free_reading_claims").update({ expires_at: new Date(Date.now() + 10 * 60000).toISOString() }).eq("id", claim.id);
    }
    // Trava atômica da geração: apenas uma requisição passa.
    const staleBefore = new Date(Date.now() - 5 * 60000).toISOString();
    const { data: locked } = await supabaseAdmin.from("orders")
      .update({ status: "generating", generation_started_at: new Date().toISOString(), error_message: null })
      .eq("id", order.id).is("reading", null)
      .or(`status.in.(pending,error),and(status.eq.generating,generation_started_at.lt.${staleBefore})`)
      .select("id, plan, cards, question, category").maybeSingle();
    if (!locked) return { ok: true }; // outra aba já está gerando
    const release = () => supabaseAdmin.from("free_reading_claims").update({ status: "released" }).eq("order_id", order.id).eq("status", "reserved");
    try {
      const { generateReadingText } = await import("./reading-ai.server");
      const reading = await generateReadingText({ id: locked.id, plan: locked.plan, cards: locked.cards as number[], question: locked.question, category: locked.category });
      const { error } = await supabaseAdmin.from("orders").update({ status: "done", reading, completed_at: new Date().toISOString() }).eq("id", locked.id);
      if (error) throw new Error("Falha ao salvar a leitura");
      await supabaseAdmin.from("free_reading_claims").update({ status: "consumed", consumed_at: new Date().toISOString() }).eq("order_id", order.id).eq("status", "reserved");
      return { ok: true };
    } catch (e) {
      console.error(`[free] generation failed order=${locked.id}`, e instanceof Error ? e.message : e);
      await supabaseAdmin.from("orders").update({ status: "error", error_message: e instanceof Error ? e.message : "falha" }).eq("id", locked.id).is("reading", null);
      await release();
      return { ok: false };
    }
  });

// Recovery for approved paid orders whose generation was interrupted (e.g. admin closed the panel mid-request).
// Only orders already marked paid by the admin (paid_at set) and stalled for 90s+ can be resumed.
export const resumePaidGeneration = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const staleBefore = new Date(Date.now() - 90 * 1000).toISOString();
    const { data: locked } = await supabaseAdmin.from("orders")
      .update({ status: "generating", generation_started_at: new Date().toISOString(), error_message: null })
      .eq("access_token", data.token).eq("is_free", false).not("paid_at", "is", null).is("reading", null)
      .or(`status.eq.error,and(status.eq.generating,generation_started_at.lt.${staleBefore})`)
      .select("id, plan, cards, question, category").maybeSingle();
    if (!locked) return { ok: true };
    try {
      const { generateReadingText } = await import("./reading-ai.server");
      const reading = await generateReadingText({ id: locked.id, plan: locked.plan, cards: locked.cards as number[], question: locked.question, category: locked.category });
      const { error } = await supabaseAdmin.from("orders").update({ status: "done", reading, completed_at: new Date().toISOString() }).eq("id", locked.id);
      if (error) throw new Error("Falha ao salvar a leitura");
      return { ok: true };
    } catch (e) {
      console.error(`[paid] resume failed order=${locked.id}`, e instanceof Error ? e.message : e);
      await supabaseAdmin.from("orders").update({ status: "error", error_message: e instanceof Error ? e.message : "falha" }).eq("id", locked.id).is("reading", null);
      return { ok: false };
    }
  });

export const adminGetFreeSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { enabled: await freeEnabled(supabaseAdmin) };
  });

export const adminSetFreeSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: input.enabled === true }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({ key: "free_reading_enabled", value: data.enabled, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar");
    return { enabled: data.enabled };
  });
