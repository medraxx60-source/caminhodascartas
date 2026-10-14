import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CARDS, PLANS, type PlanId } from "./lenormand";

const IP_LIMIT = 5; // orders per IP per window
const GLOBAL_LIMIT = 300; // orders per window across all clients
const WINDOW_MS = 60 * 60 * 1000;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { plan: PlanId; question: string; cards: number[] }) => {
    const plan = PLANS[input.plan];
    if (!plan) throw new Error("Plano inválido");
    const question = String(input.question ?? "").trim();
    if (question.length < 5 || question.length > 1000) throw new Error("Pergunta deve ter entre 5 e 1000 caracteres");
    const cards = Array.isArray(input.cards) ? input.cards.map(Number) : [];
    if (cards.length !== plan.count || new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c >= CARDS.length))
      throw new Error("Seleção de cartas inválida");
    return { plan: input.plan, question, cards };
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
      .insert({ plan: data.plan, question: data.question, cards: data.cards, price_cents: PLANS[data.plan].priceCents, client_ip_hash: ipHash })
      .select("id, access_token")
      .single();
    if (error || !row) {
      console.error("[createOrder] insert failed:", error?.code, error?.message);
      throw new Error("Não foi possível criar o pedido");
    }
    return { token: row.access_token, orderCode: row.id.slice(0, 8).toUpperCase() };
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
    return row ? { ...row, status: row.status === "done" ? "done" : "pending" } : null;
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
      .select("id, plan, question, cards, status, price_cents, created_at, paid_at, error_message, generation_started_at, reading")
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
    const apiKey = process.env["MANDAPI_API_KEY"];
    const rawBase = process.env["MANDAPI_BASE_URL"];
    if (!apiKey || !rawBase) throw new Error("Configuração da MandAPI ausente");
    const endpoint = `${rawBase.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}/chat/completions`;

    // Atomic claim in the database: admin-only, blocked when a reading exists or another generation is running.
    const { data: rows, error: claimErr } = await context.supabase.rpc("claim_order_for_generation", { _id: data.id });
    const claimed = Array.isArray(rows) ? rows[0] : null;
    if (claimErr || !claimed) throw new Error("Pedido já tem leitura, está sendo gerado agora ou não existe. Atualize a lista.");

    const plan = PLANS[claimed.plan as PlanId];
    const spread = (claimed.cards as number[]).map((c, i) => `${i + 1}. ${plan.positions[i]}: ${CARDS[c]}`).join("\n");

    let reading: string;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.6-sol",
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "Você é uma cartomante experiente em Baralho Cigano (Lenormand). Escreva em português brasileiro, falando diretamente com o consulente (você). Faça uma interpretação única, integrada, profunda, personalizada e objetiva, relacionando as cartas entre si e com as posições, sempre centrada na pergunta. Não explique cada carta isoladamente nem faça textos genéricos. Termine com uma orientação prática. Use parágrafos curtos, sem markdown pesado.",
            },
            { role: "user", content: `Pergunta: ${claimed.question}\n\nTiragem (${plan.name}, ${plan.count} cartas):\n${spread}` },
          ],
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300).replace(apiKey, "[redacted]");
        console.error(`[mandapi] order=${claimed.id} status=${res.status} body=${body}`);
        const friendly =
          res.status === 401 || res.status === 403 ? "MandAPI recusou a chave (verifique MANDAPI_API_KEY)."
          : res.status === 404 ? "Endpoint ou modelo não encontrado na MandAPI (verifique a Base URL e o modelo)."
          : res.status === 402 ? "Saldo insuficiente na MandAPI."
          : res.status === 429 ? "Limite de uso da MandAPI atingido. Tente novamente em instantes."
          : `MandAPI retornou erro ${res.status}.`;
        throw new Error(friendly);
      }
      const json: any = await res.json();
      reading = json?.choices?.[0]?.message?.content?.trim();
      if (!reading) throw new Error("A MandAPI respondeu sem texto.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha de conexão com a MandAPI.";
      if (!(e instanceof Error)) console.error(`[mandapi] order=${claimed.id} network error`);
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
