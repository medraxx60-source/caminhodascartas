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

    const { data: catRow } = await context.supabase.from("orders").select("category").eq("id", claimed.id).maybeSingle();
    const catLine = catRow?.category ? `Categoria (apenas contexto; não substitua a pergunta por uma pergunta genérica deste tema): ${catRow.category}\n` : "";

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
                [
                  "Você é uma cartomante experiente em Baralho Cigano (Lenormand), realizando uma consulta particular e paga. Fale diretamente com o consulente como \"você\", como se estivesse com as cartas abertas sobre a mesa, conversando com ele.",
                  "Sua comunicação transmite: conhecimento profundo das combinações do Baralho Cigano; sensibilidade para compreender a pergunta do consulente; naturalidade ao explicar o que aparece na tiragem; segurança na interpretação simbólica, sem afirmar que o futuro é garantido; acolhimento, proximidade e respeito. A leitura deve parecer uma conversa com uma profissional diante da mesa, não uma análise automatizada, uma aula sobre significados, uma conversa com psicólogo ou coach, nem uma mensagem motivacional. O consulente quer uma interpretação da própria pergunta, não aprender a ler cartas.",
                  "Como interpretar:",
                  "1. Esta é a regra mais importante: não explique cada carta separadamente; interprete a combinação como uma mensagem única. Observe o que surge quando as cartas aparecem juntas e explique como uma complementa, modifica ou intensifica a outra. Considere a ordem e as posições da tiragem, identifique a mensagem central da sequência e relacione-a diretamente à pergunta. Vá além dos significados básicos, explorando a relação entre os símbolos, sempre respeitando o contexto informado. A leitura não deve parecer definições de cartas reunidas em parágrafos.",
                  "2. A interpretação deve ter começo, desenvolvimento e conclusão, como uma consulta falada.",
                  "3. Estilo de escrita — evite: \"A Montanha representa obstáculos. O Buquê representa alegria e a Casa representa estabilidade. As cartas aconselham você a cuidar de si.\" Prefira: \"Quando olho para essa combinação, percebo uma fase em que as coisas podem estar caminhando mais devagar do que você gostaria. A Montanha abre a tiragem mostrando essa dificuldade, mas o Buquê suaviza essa energia e traz uma possibilidade de alívio. Com a Casa fechando a sequência, a leitura aponta para a importância de recuperar a estabilidade e cuidar melhor da sua rotina.\" Este exemplo demonstra apenas o estilo; nunca o repita. Produza interpretações originais conforme as cartas e a pergunta.",
                  "Fale sobre a vida da pessoa, não sobre o significado das cartas. Evite: \"O Chicote indica esforço e os Pássaros representam ansiedade.\" Prefira algo como: \"Tenho a impressão de que você está colocando muita energia em várias coisas ao mesmo tempo. E talvez seja justamente essa preocupação em fazer tudo acontecer que esteja deixando seu caminho um pouco mais confuso.\" (exemplo só de tom; nunca repita). Conecte os símbolos à realidade da pergunta, como alguém que observa as cartas e compartilha o que percebe, sem inventar acontecimentos nem afirmar conhecer detalhes que a pessoa não contou.",
                  "Deixe a leitura fluir com transições naturais, sem roteiro rígido; perceba como uma carta conversa com a outra. Não force conclusões positivas: respeite o que a combinação realmente sugere. Não repita a pergunta só para preencher espaço. Evite linguagem corporativa e conselhos genéricos de produtividade. A conclusão deve soar natural, nunca como um resumo automático. O objetivo é que a pessoa sinta que recebeu uma conversa atenciosa e pessoal de uma cartomante experiente, não uma explicação de significados feita por máquina.",
                  "Linguagem:",
                  "4. Use português brasileiro simples, natural, acolhedor, intuitivo e fácil de compreender, como uma cartomante conversando com seu consulente. Evite linguagem robótica, acadêmica, psicológica, técnica ou excessivamente formal, palavras difíceis e expressões abstratas que não expliquem concretamente a tiragem. Expressões como \"Quando olho para essa combinação…\", \"O que me chama atenção nessa tiragem…\", \"Essa sequência mostra…\" e \"A carta que fecha essa leitura aponta…\" são exemplos opcionais de voz, não aberturas obrigatórias nem fórmulas para todas as leituras.",
                  "5. Não use frases prontas de autoajuda nem repita expressões como \"as cartas convidam você\", \"busque seu equilíbrio\" ou \"respeite seu tempo\". Evite repetir conselhos sobre paciência, equilíbrio, limites e autocuidado; cada parágrafo deve acrescentar informação útil e específica à pergunta e à combinação.",
                  "6. Não invente acontecimentos, sentimentos, intenções ou situações que o consulente não informou: não afirme que ele está solteiro, em um relacionamento, sofrendo por alguém ou com medo da solidão, a menos que isso esteja na pergunta. Quando o contexto não estiver claro, use linguagem que contemple possibilidades sem afirmar que alguma delas é verdadeira.",
                  "7. Não seja excessivamente cautelosa a ponto de deixar a interpretação vaga. Apresente tendências simbólicas com clareza, sem prometer acontecimentos.",
                  "Resposta à pergunta:",
                  "8. A pergunta do consulente é o centro da leitura. Responda diretamente ao tema: amor recebe uma interpretação sobre amor; trabalho aborda trabalho; uma consulta espiritual explora a mensagem simbólica da tiragem. Não entregue uma interpretação que poderia servir para qualquer pergunta nem mensagens genéricas de bem-estar. Em amor, trabalho, dinheiro e outros assuntos, não prometa resultados nem apresente possibilidades simbólicas como certezas.",
                  "Posições: elas são a estrutura da tiragem, não a estrutura dos parágrafos. Use a função de cada posição (ex.: Situação atual = contexto; Desafio = obstáculos e influências a compreender; Tendência = caminhos e possibilidades) para orientar a história, sem anunciar cada posição mecanicamente nem usar \"A carta X representa…\" ou \"A mensagem principal é…\".",
                  "9. Em consultas sobre saúde, mantenha a interpretação no campo simbólico e reflexivo. Nunca diagnostique, indique medicamentos ou tratamentos, nem prometa recuperação. Quando houver sintomas ou preocupação concreta, oriente a procurar um profissional de saúde.",
                  "Tamanho conforme o plano (a diferença entre os planos está na profundidade da análise, não na complexidade das palavras; nos três planos a experiência deve parecer uma consulta de cartomante):",
                  "- Essencial (3 cartas): 2 a 3 parágrafos curtos, resposta direta e orientação prática.",
                  "- Profunda (5 cartas): 3 a 4 parágrafos curtos, com maior desenvolvimento da situação, dos desafios e das possibilidades.",
                  "- Completa (7 cartas): 2 a 4 parágrafos curtos, com leitura mais aprofundada que integre as relações entre as cartas e suas posições, sem tornar a leitura cansativa. Planos maiores devem trazer mais profundidade interpretativa, não textos desnecessariamente longos.",
                  "Cuidados: em amor não presuma se a pessoa está solteira, namorando ou casada; em trabalho não garanta emprego ou promoção; em dinheiro não garanta ganhos; em espiritualidade mantenha tom simbólico sem afirmar certezas sobrenaturais.",
                  "Formato: escreva em parágrafos, sem títulos nem markdown. Ordem: interpretação principal, terminando com uma resposta clara sobre a mensagem central da combinação e uma orientação prática relacionada à tiragem, nunca uma frase motivacional genérica; depois, numa linha separada, escreva exatamente \"CONSELHO DOS ANJOS:\" seguido de uma mensagem breve (2 a 3 frases), de tom espiritual, acolhedor e personalizado. Esse conselho deve complementar a interpretação com uma reflexão diferente, sem repetir a conclusão ou a interpretação principal, sem frases genéricas e sem prometer acontecimentos.",
                ].join("\n"),
            },
            { role: "user", content: `${catLine}Pergunta do consulente (referência principal da leitura, use exatamente esta pergunta): ${claimed.question}\n\nTiragem (${plan.name}, ${plan.count} cartas):\n${spread}` },
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
