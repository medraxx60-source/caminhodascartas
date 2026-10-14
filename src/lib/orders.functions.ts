import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CARDS, PLANS, type PlanId } from "./lenormand";

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
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({ plan: data.plan, question: data.question, cards: data.cards, price_cents: PLANS[data.plan].priceCents })
      .select("access_token")
      .single();
    if (error || !row) throw new Error("Não foi possível criar o pedido");
    return { token: row.access_token };
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

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado");
}

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, plan, question, cards, status, price_cents, created_at, paid_at, error_message")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const adminConfirmAndGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const apiKey = process.env["MANDAPI_API_KEY"];
    const baseUrl = process.env["MANDAPI_BASE_URL"];
    if (!apiKey || !baseUrl) throw new Error("Configuração da MandAPI ausente (MANDAPI_API_KEY / MANDAPI_BASE_URL)");

    // Atomic claim: only one request can move pending/error -> generating.
    const { data: claimed } = await context.supabase
      .from("orders")
      .update({ status: "generating", paid_at: new Date().toISOString(), error_message: null })
      .eq("id", data.id)
      .in("status", ["pending", "error"])
      .select("id, plan, question, cards")
      .maybeSingle();
    if (!claimed) throw new Error("Pedido já processado ou em processamento");

    const plan = PLANS[claimed.plan as PlanId];
    const spread = (claimed.cards as number[])
      .map((c, i) => `${i + 1}. ${plan.positions[i]}: ${CARDS[c]}`)
      .join("\n");

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.6-sol",
          reasoning_effort: "none",
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
      if (!res.ok) throw new Error(`MandAPI ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json: any = await res.json();
      const reading = json?.choices?.[0]?.message?.content?.trim();
      if (!reading) throw new Error("Resposta vazia da MandAPI");
      await context.supabase
        .from("orders")
        .update({ status: "done", reading, completed_at: new Date().toISOString() })
        .eq("id", claimed.id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase.from("orders").update({ status: "error", error_message: msg }).eq("id", claimed.id);
      throw new Error(msg);
    }
  });
