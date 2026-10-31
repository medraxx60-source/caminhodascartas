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
import { adminGetFreeSetting, adminSetFreeSetting, adminConfirmAndGenerate, adminListOrders, adminRejectOrder, adminSaveReading, adminStatus, claimAdmin } from "@/lib/orders.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel — EntreCarta.tarô" },
      { name: "description", content: "Painel administrativo de pedidos." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Painel — EntreCarta.tarô" },
      { property: "og:description", content: "Painel administrativo." },
    ],
  }),
  component: Admin,
});

const STAGE_LABEL: Record<string, string> = { pix: "Na tela do Pix (ainda não abriu a página de leitura)", waiting: "Na página de leitura, aguardando aprovação", reading: "Já abriu e está lendo a interpretação" };

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
      if (password.length < 8) { toast.error("A senha precisa ter pelo menos 8 caracteres."); return; }
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

const STATUS_LABEL: Record<string, string> = { pending: "Aguardando pagamento", generating: "Gerando leitura", done: "Concluído", error: "Falhou", rejected: "Recusado" };

function Orders() {
  const list = useServerFn(adminListOrders);
  const confirm = useServerFn(adminConfirmAndGenerate);
  const save = useServerFn(adminSaveReading);
  const reject = useServerFn(adminRejectOrder);
  const refuse = async (o: Order) => {
    if (!window.confirm(`Recusar o pedido ${code(o)}? O cliente não receberá a leitura.`)) return;
    setBusy(o.id);
    try { await reject({ data: { id: o.id } }); toast.success("Pedido recusado"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(null); load(); }
  };
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "paid" | "free">("pending");
  const [unsaved, setUnsaved] = useState<Record<string, string>>({});

  const [refreshing, setRefreshing] = useState(false);
  const load = () => list().then(setOrders).catch((e) => { toast.error(e.message); setOrders([]); });
  const refresh = async () => {
    setRefreshing(true);
    try { setOrders(await list()); toast.success("Lista de pedidos atualizada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao atualizar"); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const code = (o: Order) => o.id.slice(0, 8).toUpperCase();
  const stale = (o: Order) => o.status === "generating" && !!o.generation_started_at && Date.now() - new Date(o.generation_started_at).getTime() > STALE_MS;
  const canRun = (o: Order) => !o.is_free && !o.hasReading && (o.status === "pending" || o.status === "error" || stale(o));

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

  // Free (cortesia) orders never need payment approval, so they stay out of "Pendentes" and are never counted as revenue.
  const all = orders ?? [];
  const shown = all.filter((o) =>
    tab === "pending" ? !o.is_free && (o.status === "pending" || o.status === "error")
    : tab === "free" ? o.is_free
    : !o.is_free && (o.status === "done" || o.status === "generating" || o.status === "rejected"));
  const paidDone = all.filter((o) => !o.is_free && (o.status === "done" || o.status === "generating"));
  const revenue = paidDone.reduce((s, o) => s + o.price_cents, 0);
  const freeDone = all.filter((o) => o.is_free && o.status === "done").length;
  const freeTotal = all.filter((o) => o.is_free).length;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <BackLink />
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-4xl font-bold text-primary">Pedidos</h1>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
      <FreeToggle />
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Consultas pagas</p><p className="text-2xl font-bold text-primary">{paidDone.length}</p></div>
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Receita recebida</p><p className="text-lg font-bold text-primary">{formatBRL(revenue)}</p></div>
        <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Tiragens grátis</p><p className="text-2xl font-bold text-primary">{freeDone}</p><p className="text-[10px] text-muted-foreground">{freeTotal} no total</p></div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>Pendentes</Button>
        <Button variant={tab === "paid" ? "default" : "outline"} onClick={() => setTab("paid")}>Pagos</Button>
        <Button variant={tab === "free" ? "default" : "outline"} onClick={() => setTab("free")}>Grátis</Button>
        <Button variant="ghost" onClick={refresh} disabled={refreshing}>
          <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>
      <div className="mt-6 space-y-3">
        {orders === null && <p className="text-muted-foreground">Carregando...</p>}
        {orders && shown.length === 0 && <p className="text-muted-foreground">Nenhum pedido.</p>}
        {shown.map((o) => (
          <div key={o.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="font-mono text-xl font-bold tracking-widest text-primary">{code(o)}</span>
                {o.is_free && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary-foreground">GRÁTIS</span>}
              </span>
              <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <p className="text-sm font-semibold">{PLANS[o.plan as PlanId].name} · {(o.cards as number[]).length} cartas · {o.is_free ? "R$ 0 (cortesia)" : formatBRL(o.price_cents)} · {STATUS_LABEL[o.status] ?? o.status}</p>
            <p className="mt-2 inline-block rounded-full border border-gold bg-gold/10 px-3 py-1 text-xs font-semibold text-primary">Etapa atual: {STAGE_LABEL[o.client_stage] ?? o.client_stage}{o.stage_updated_at ? ` · ${new Date(o.stage_updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            <p className="mt-2">{o.question}</p>
            <p className="mt-1 text-xs text-muted-foreground">{(o.cards as number[]).map((c) => CARDS[c]).join(" · ")}</p>
            {o.access_token && (() => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/leitura/${o.access_token}`;
              return (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs underline">{url}</a>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link da leitura copiado"); }}>Copiar link</Button>
                </div>
              );
            })()}
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
            {(o.status === "pending" || o.status === "error") && !o.hasReading && !unsaved[o.id] && (
              <Button variant="outline" className="mt-2 w-full border-destructive text-destructive" disabled={busy === o.id} onClick={() => refuse(o)}>
                Recusar pedido
              </Button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function FreeToggle() {
  const get = useServerFn(adminGetFreeSetting);
  const set = useServerFn(adminSetFreeSetting);
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { get().then((r) => setOn(r.enabled)).catch(() => setOn(null)); }, []);
  const flip = async () => {
    if (on === null) return;
    try { const r = await set({ data: { enabled: !on } }); setOn(r.enabled); toast.success(r.enabled ? "Promoção ativada" : "Promoção desativada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };
  return (
    <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div>
        <p className="font-semibold">Promoção 1ª Tiragem Gratuita</p>
        <p className="text-xs text-muted-foreground">3 cartas grátis para quem ainda não usou.</p>
      </div>
      <Button variant={on ? "default" : "outline"} disabled={on === null} onClick={flip}>{on === null ? "..." : on ? "Ativada" : "Desativada"}</Button>
    </div>
  );
}
