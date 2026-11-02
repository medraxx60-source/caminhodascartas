import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{48}$/),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(400).optional().default(""),
  name: z.string().trim().max(40).optional().default(""),
});

// Customer leaves one review per finished reading (identified by its private token).
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((d) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: o } = await supabaseAdmin.from("orders").select("id, status").eq("access_token", data.token).maybeSingle();
    if (!o || o.status !== "done") throw new Error("Leitura não encontrada");
    const { error } = await (supabaseAdmin.from("reviews") as any).upsert(
      { order_id: o.id, rating: data.rating, comment: data.comment || null, display_name: data.name || null, approved: false },
      { onConflict: "order_id" },
    );
    if (error) throw new Error("Não foi possível salvar sua avaliação");
    return { ok: true };
  });

export const getMyReview = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: o } = await supabaseAdmin.from("orders").select("id").eq("access_token", data.token).maybeSingle();
    if (!o) return null;
    const { data: r } = await (supabaseAdmin.from("reviews") as any).select("rating").eq("order_id", o.id).maybeSingle();
    return r ? { rating: r.rating as number } : null;
  });

// Public: only reviews the admin approved, never question or order data.
export const listPublicReviews = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin.from("reviews") as any)
    .select("id, rating, comment, display_name, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as { id: string; rating: number; comment: string | null; display_name: string | null; created_at: string }[];
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  return { count: rows.length, average: Math.round(avg * 10) / 10, items: rows.filter((r) => r.comment).slice(0, 6) };
});

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado");
}

export const adminListReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any).from("reviews").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error("Não foi possível carregar as avaliações");
    return data as { id: string; rating: number; comment: string | null; display_name: string | null; approved: boolean; created_at: string }[];
  });

export const adminSetReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approved?: boolean; remove?: boolean }) =>
    z.object({ id: z.string().uuid(), approved: z.boolean().optional(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const t = (context.supabase as any).from("reviews");
    const { error } = data.remove ? await t.delete().eq("id", data.id) : await t.update({ approved: !!data.approved }).eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar avaliação");
    return { ok: true };
  });
