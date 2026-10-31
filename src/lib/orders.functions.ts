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
    try {
      const lk = process.env["LOVABLE_API_KEY"];
      const tk = process.env["TELEGRAM_API_KEY"];
      const chats = (process.env["TELEGRAM_CHAT_IDS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (lk && tk && chats.length) {
        const p = PLANS[data.plan];
        const price = (p.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const text = `🔔 Novo pedido aguardando aprovação\n\nCódigo: ${orderCode}\nPlano: ${p.name} (${price})\n\nConfira o Pix no banco e aprove no painel:\nhttps://entre-cartas.lovable.app/admin`;
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
    return { token: row.access_token, orderCode };
  });

export const getOrderByToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select("plan, question, cards, status, reading, price_cents, created_at")
      .eq("access_token", data.token)
      .maybeSingle();
    if (row) {
      const stage = row.status === "done" ? "reading" : "waiting";
      await supabaseAdmin.from("orders").update({ client_stage: stage, stage_updated_at: new Date().toISOString() })
        .eq("access_token", data.token).neq("client_stage", "reading");
    }
    const s = row?.status;
    const status: "done" | "rejected" | "generating" | "pending" =
      s === "done" ? "done" : s === "rejected" ? "rejected" : s === "generating" ? "generating" : "pending";
    return row ? { ...row, status } : null;
  });

export const getOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{48}$/.test(input.token ?? "")) throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("orders").select("status").eq("access_token", data.token).maybeSingle();
    return { status: (row?.status as string | undefined) ?? null };
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
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, plan, question, cards, status, price_cents, created_at, paid_at, error_message, generation_started_at, reading, client_stage, stage_updated_at, access_token")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Não foi possível carregar os pedidos");
    return data.map(({ reading, ...o }) => ({ ...o, hasReading: !!reading }));
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
