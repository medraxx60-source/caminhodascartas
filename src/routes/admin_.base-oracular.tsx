import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminStatus } from "@/lib/orders.functions";
import { CARD_FIELDS, POSITIONS, STATUS_LABEL } from "@/lib/oracular-base";

type CardRow = Database["public"]["Tables"]["lenormand_cards"]["Row"];

export const Route = createFileRoute("/admin_/base-oracular")({
  head: () => ({
    meta: [
      { title: "Base Oracular — Caminho das Cartas" },
      { name: "description", content: "Gerenciamento privado das fichas das 36 cartas." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Base Oracular — Caminho das Cartas" },
      { property: "og:description", content: "Área administrativa privada." },
    ],
  }),
  component: Page,
});

function Page() {
  const status = useServerFn(adminStatus);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return setOk(false);
      status().then((r) => setOk(r.isAdmin)).catch(() => setOk(false));
    });
  }, []);
  if (ok === null) return null;
  if (!ok) return (
    <main className="mx-auto max-w-sm px-5 py-12 text-center">
      <p>Entre no painel como administrador primeiro.</p>
      <Link to="/admin" className="mt-4 inline-block text-primary underline">Ir para o painel</Link>
    </main>
  );
  return <Base />;
}

const BADGE: Record<string, string> = {
  pendente: "border-muted-foreground/40 text-muted-foreground",
  em_andamento: "border-gold/50 text-gold",
  completa: "border-primary bg-primary/15 text-primary",
};

function Base() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("todas");
  const [open, setOpen] = useState<CardRow | null>(null);
  const load = async () => {
    const { data, error } = await supabase.from("lenormand_cards").select("*").order("card_number");
    if (error) toast.error("Não foi possível carregar as cartas.");
    else setCards(data);
  };
  useEffect(() => { load(); }, []);
  const list = useMemo(() => cards.filter((c) =>
    (filter === "todas" || c.content_status === filter) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || String(c.card_number) === q.trim())), [cards, q, filter]);
  const count = (s: string) => cards.filter((c) => c.content_status === s).length;

  if (open) return <Editor card={open} onClose={(saved) => { setOpen(null); if (saved) load(); }} />;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/admin" className="text-sm text-muted-foreground hover:text-primary">← Voltar ao painel</Link>
      <h1 className="mt-3 font-display text-2xl text-gold">Base Oracular</h1>
      <p className="mt-1 text-sm text-muted-foreground">Fichas privadas das 36 cartas. Quando a função estiver ativada no painel, somente as fichas completas e autorizadas serão usadas como referência pela IA. O conteúdo não é exibido ao público.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[["todas", `Todas (${cards.length})`], ["pendente", `Pendentes (${count("pendente")})`], ["em_andamento", `Em andamento (${count("em_andamento")})`], ["completa", `Completas (${count("completa")})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k!)} className={`rounded-full border px-3 py-1 ${filter === k ? "border-gold text-gold" : "border-gold/20 text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <Input className="mt-3" placeholder="Buscar por nome ou número" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-4 space-y-2">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => setOpen(c)} className="flex w-full items-center gap-3 rounded-xl border border-gold/20 bg-gold/[0.04] px-3 py-3 text-left hover:border-gold/50">
              <span className="w-8 text-center font-display text-gold">{c.card_number}</span>
              <span className="flex-1">{c.name}</span>
              {c.is_published && <span className="text-xs text-muted-foreground">autorizada para IA</span>}
              <span className={`rounded-full border px-2 py-0.5 text-xs ${BADGE[c.content_status]}`}>{STATUS_LABEL[c.content_status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Editor({ card, onClose }: { card: CardRow; onClose: (saved: boolean) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(CARD_FIELDS.map((f) => [f.key, (card[f.key] as string | null) ?? ""])));
  const [keywords, setKeywords] = useState(card.keywords.join(", "));
  const [pos, setPos] = useState<Record<string, string>>(() => ({ ...(card.position_meanings as Record<string, string>) }));
  const [published, setPublished] = useState(card.is_published);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const clean = (s: string) => (s.trim() ? s.trim() : null);
    const position_meanings = Object.fromEntries(POSITIONS.map((p) => [p.key, (pos[p.key] ?? "").trim()]).filter(([, v]) => v));
    const { error } = await supabase.from("lenormand_cards").update({
      ...Object.fromEntries(CARD_FIELDS.map((f) => [f.key, clean(form[f.key] ?? "")])),
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      position_meanings, is_published: published,
    }).eq("id", card.id);
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar."); return; }
    toast.success("Ficha salva.");
    onClose(true);
  };
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <button onClick={() => onClose(false)} className="text-sm text-muted-foreground hover:text-primary">← Voltar à lista</button>
      <h1 className="mt-3 font-display text-2xl text-gold">{card.card_number}. {card.name}</h1>
      <div className="mt-3 flex gap-2">
        <Button variant={preview ? "outline" : "default"} size="sm" onClick={() => setPreview(false)}>Editar</Button>
        <Button variant={preview ? "default" : "outline"} size="sm" onClick={() => setPreview(true)}>Prévia</Button>
      </div>
      {preview ? (
        <div className="mt-5 space-y-4 rounded-xl border border-gold/20 p-4">
          {keywords && <p className="text-sm text-gold">{keywords}</p>}
          {CARD_FIELDS.filter((f) => form[f.key]?.trim()).map((f) => (
            <section key={f.key}><h2 className="font-display text-gold">{f.label}</h2><p className="whitespace-pre-line text-sm">{form[f.key]}</p></section>
          ))}
          {POSITIONS.filter((p) => pos[p.key]?.trim()).map((p) => (
            <section key={p.key}><h2 className="font-display text-gold">Posição: {p.label}</h2><p className="whitespace-pre-line text-sm">{pos[p.key]}</p></section>
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block text-sm">Palavras-chave (separadas por vírgula)<Input className="mt-1" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></label>
          {CARD_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">{f.label}
              <Textarea className="mt-1" rows={3} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
          <h2 className="pt-2 font-display text-lg text-gold">Interpretações por posição</h2>
          {POSITIONS.map((p) => (
            <label key={p.key} className="block text-sm">{p.label}
              <Textarea className="mt-1" rows={2} value={pos[p.key] ?? ""} onChange={(e) => setPos({ ...pos, [p.key]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      <label className="mt-6 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Autorizar uso desta ficha pela IA quando a Base Oracular estiver ativada (a ficha continua privada)
      </label>
      <Button className="mt-4 w-full" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar ficha"}</Button>
    </main>
  );
}
