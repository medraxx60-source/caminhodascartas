import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CARDS, PLANS, formatBRL, type PlanId } from "@/lib/lenormand";
import { adminConfirmAndGenerate, adminListOrders } from "@/lib/orders.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel — Entre Cartas" },
      { name: "description", content: "Painel administrativo de pedidos." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Painel — Entre Cartas" },
      { property: "og:description", content: "Painel administrativo." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  return session ? <Orders /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error, data } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
    if (error) return toast.error(error.message);
    if (mode === "up" && !data.session) toast.success("Confirme seu e-mail para entrar.");
  };
  return (
    <main className="mx-auto max-w-sm px-5 py-24">
      <h1 className="text-center text-4xl font-bold text-primary">Painel</h1>
      <form onSubmit={go} className="mt-8 space-y-3">
        <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <Button className="w-full" type="submit">{mode === "in" ? "Entrar" : "Criar conta"}</Button>
      </form>
      <button className="mt-4 w-full text-sm text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
      </button>
    </main>
  );
}

type Order = Awaited<ReturnType<typeof adminListOrders>>[number];

function Orders() {
  const list = useServerFn(adminListOrders);
  const confirm = useServerFn(adminConfirmAndGenerate);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "paid">("pending");

  const load = () => list().then(setOrders).catch((e) => { toast.error(e.message); setOrders([]); });
  useEffect(() => { load(); }, []);

  const run = async (o: Order) => {
    if (!window.confirm(`Confirma que recebeu ${formatBRL(o.price_cents)} via Pix na sua conta?`)) return;
    setBusy(o.id);
    try {
      await confirm({ data: { id: o.id } });
      toast.success("Leitura gerada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
      load();
    }
  };

  const shown = (orders ?? []).filter((o) => (tab === "pending" ? o.status === "pending" || o.status === "error" : o.status === "done" || o.status === "generating"));

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-primary">Pedidos</h1>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>Pendentes</Button>
        <Button variant={tab === "paid" ? "default" : "outline"} onClick={() => setTab("paid")}>Pagos</Button>
      </div>
      <div className="mt-6 space-y-3">
        {orders === null && <p className="text-muted-foreground">Carregando...</p>}
        {orders && shown.length === 0 && <p className="text-muted-foreground">Nenhum pedido.</p>}
        {shown.map((o) => (
          <div key={o.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{PLANS[o.plan as PlanId].name} · {formatBRL(o.price_cents)}</span>
              <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <p className="mt-2">{o.question}</p>
            <p className="mt-1 text-xs text-muted-foreground">{(o.cards as number[]).map((c) => CARDS[c]).join(" · ")}</p>
            <p className="mt-1 text-xs">Pedido #{o.id.slice(0, 8)} · {o.status}</p>
            {o.error_message && <p className="mt-1 text-xs text-destructive">{o.error_message}</p>}
            {(o.status === "pending" || o.status === "error") && (
              <Button className="mt-3 w-full" disabled={busy === o.id} onClick={() => run(o)}>
                {busy === o.id ? "Gerando..." : "Confirmar pagamento e gerar leitura"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
