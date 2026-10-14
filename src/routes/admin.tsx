import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CARDS, PLANS, formatBRL, type PlanId } from "@/lib/lenormand";
import { adminConfirmAndGenerate, adminListOrders, adminSaveReading, adminStatus, claimAdmin } from "@/lib/orders.functions";

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

const STALE_MS = 5 * 60 * 1000;

function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  return session ? <Gate key={session.user.id} /> : <Login />;
}

function BackLink() {
  return <Link to="/" className="text-sm text-muted-foreground hover:text-primary">← Voltar ao site</Link>;
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message.includes("confirm") ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha inválidos.");
    } else {
      if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
      if (error) toast.error(error.message.includes("weak") || error.message.includes("pwned") ? "Senha fraca ou já vazada. Escolha outra." : "Não foi possível criar a conta.");
      else setSent(true);
    }
  };
  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <BackLink />
      <h1 className="mt-10 text-center text-4xl font-bold text-primary">Painel</h1>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant={mode === "in" ? "default" : "outline"} onClick={() => { setMode("in"); setSent(false); }}>Entrar</Button>
        <Button variant={mode === "up" ? "default" : "outline"} onClick={() => setMode("up")}>Criar conta</Button>
      </div>
      {sent ? (
        <p className="mt-6 rounded-md bg-card p-4 text-center text-sm">Conta criada! Abra o e-mail que enviamos para <b>{email}</b>, confirme e depois volte aqui para entrar.</p>
      ) : (
        <form onSubmit={go} className="mt-6 space-y-3">
          <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder={mode === "up" ? "Crie uma senha (mín. 8)" : "Senha"} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button className="w-full" type="submit">{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
      )}
      {mode === "up" && !sent && <p className="mt-4 text-center text-xs text-muted-foreground">Depois de entrar, informe o código de ativação para virar administrador.</p>}
    </main>
  );
}

function Gate() {
  const status = useServerFn(adminStatus);
  const claim = useServerFn(claimAdmin);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { status().then((r) => setAdmin(r.isAdmin)).catch(() => setAdmin(false)); }, []);
  if (admin === null) return null;
  if (admin) return <Orders />;
  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await claim({ data: { code } }); setAdmin(true); toast.success("Administrador ativado"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
  };
  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <BackLink />
      <h1 className="mt-10 text-center text-3xl font-bold text-primary">Acesso restrito</h1>
      <p className="mt-3 text-center text-sm text-muted-foreground">Esta conta não é administradora. Se você é o proprietário, informe o código de ativação.</p>
      <form onSubmit={activate} className="mt-6 space-y-3">
        <Input type="password" placeholder="Código de ativação" value={code} onChange={(e) => setCode(e.target.value)} required />
        <Button className="w-full" type="submit">Ativar administrador</Button>
      </form>
      <Button variant="ghost" className="mt-4 w-full" onClick={() => supabase.auth.signOut()}>Sair</Button>
    </main>
  );
}

type Order = Awaited<ReturnType<typeof adminListOrders>>[number];

const STATUS_LABEL: Record<string, string> = { pending: "Aguardando pagamento", generating: "Gerando leitura", done: "Concluído", error: "Falhou" };

function Orders() {
  const list = useServerFn(adminListOrders);
  const confirm = useServerFn(adminConfirmAndGenerate);
  const save = useServerFn(adminSaveReading);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [unsaved, setUnsaved] = useState<Record<string, string>>({});

  const load = () => list().then(setOrders).catch((e) => { toast.error(e.message); setOrders([]); });
  useEffect(() => { load(); }, []);

  const code = (o: Order) => o.id.slice(0, 8).toUpperCase();
  const stale = (o: Order) => o.status === "generating" && !!o.generation_started_at && Date.now() - new Date(o.generation_started_at).getTime() > STALE_MS;
  const canRun = (o: Order) => !o.hasReading && (o.status === "pending" || o.status === "error" || stale(o));

  const run = async (o: Order) => {
    const msg = o.status === "pending"
      ? `Confirma que recebeu ${formatBRL(o.price_cents)} via Pix referente ao pedido ${code(o)}? A IA será chamada agora para gerar a leitura.`
      : `Tentar gerar novamente a leitura do pedido ${code(o)}?`;
    if (!window.confirm(msg)) return;
    setBusy(o.id);
    try {
      const r = await confirm({ data: { id: o.id } });
      if (r.ok) toast.success("Leitura gerada e salva");
      else {
        setUnsaved((u) => ({ ...u, [o.id]: r.unsavedReading! }));
        toast.error("A leitura foi gerada, mas não foi salva. Use “Salvar leitura” abaixo.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
      load();
    }
  };

  const saveUnsaved = async (o: Order) => {
    setBusy(o.id);
    try {
      await save({ data: { id: o.id, reading: unsaved[o.id]! } });
      setUnsaved(({ [o.id]: _, ...rest }) => rest);
      toast.success("Leitura salva");
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
      <BackLink />
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-4xl font-bold text-primary">Pedidos</h1>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>Pendentes</Button>
        <Button variant={tab === "paid" ? "default" : "outline"} onClick={() => setTab("paid")}>Pagos</Button>
        <Button variant="ghost" onClick={load}>Atualizar</Button>
      </div>
      <div className="mt-6 space-y-3">
        {orders === null && <p className="text-muted-foreground">Carregando...</p>}
        {orders && shown.length === 0 && <p className="text-muted-foreground">Nenhum pedido.</p>}
        {shown.map((o) => (
          <div key={o.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold tracking-widest text-primary">{code(o)}</span>
              <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <p className="text-sm font-semibold">{PLANS[o.plan as PlanId].name} · {formatBRL(o.price_cents)} · {STATUS_LABEL[o.status] ?? o.status}</p>
            <p className="mt-2">{o.question}</p>
            <p className="mt-1 text-xs text-muted-foreground">{(o.cards as number[]).map((c) => CARDS[c]).join(" · ")}</p>
            {o.error_message && <p className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{o.error_message}</p>}
            {o.status === "generating" && !stale(o) && <p className="mt-2 text-xs text-muted-foreground">Em geração. Se não concluir em 5 minutos, será possível tentar novamente.</p>}
            {unsaved[o.id] && (
              <div className="mt-3 space-y-2">
                <Textarea readOnly value={unsaved[o.id]} className="min-h-32 text-xs" />
                <Button className="w-full" disabled={busy === o.id} onClick={() => saveUnsaved(o)}>Salvar leitura</Button>
              </div>
            )}
            {canRun(o) && !unsaved[o.id] && (
              <Button className="mt-3 w-full" disabled={busy === o.id} onClick={() => run(o)}>
                {busy === o.id ? "Gerando..." : o.status === "pending" ? "Confirmar pagamento e liberar IA" : "Tentar novamente"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
