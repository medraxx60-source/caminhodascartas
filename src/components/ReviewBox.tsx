import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyReview, submitReview } from "@/lib/reviews.functions";

export function ReviewBox({ token }: { token: string }) {
  const send = useServerFn(submitReview);
  const mine = useServerFn(getMyReview);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => { mine({ data: { token } }).then((r) => r && setState("done")).catch(() => {}); }, [token]);

  if (state === "done") {
    return (
      <section className="mt-10 rounded-xl border border-gold/50 bg-card p-6 text-center">
        <p className="text-2xl text-gold">✦</p>
        <p className="mt-1 font-display text-xl text-primary">Gratidão pela sua avaliação!</p>
        <p className="mt-2 text-sm text-muted-foreground">Ela ajuda outras pessoas a encontrarem clareza.</p>
      </section>
    );
  }

  const submit = async () => {
    setState("sending");
    try { await send({ data: { token, rating, comment, name } }); setState("done"); } catch { setState("error"); }
  };

  return (
    <section className="mt-10 rounded-xl border border-gold/50 bg-card p-6 text-center">
      <h2 className="font-display text-2xl font-semibold text-primary">Esta leitura fez sentido para você?</h2>
      <div className="mt-4 flex justify-center gap-2" role="radiogroup" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1">
            <Star className={`h-9 w-9 transition ${n <= rating ? "fill-gold text-gold" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="mt-4 space-y-3 text-left">
          <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 400))} rows={3} placeholder="O que mais tocou você nesta leitura? (opcional)" className="w-full rounded-md border border-border bg-background p-3 text-base" />
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Seu nome ou iniciais (opcional)" className="w-full rounded-md border border-border bg-background p-3 text-base" />
          <p className="text-xs text-muted-foreground">Sua pergunta nunca é exibida. Só mostramos a nota e a frase que você escrever.</p>
          <Button className="gold-button h-12 w-full" disabled={state === "sending"} onClick={submit}>{state === "sending" ? "Enviando..." : "Enviar avaliação"}</Button>
          {state === "error" && <p className="text-center text-sm text-destructive">Não foi possível enviar. Tente novamente.</p>}
        </div>
      )}
    </section>
  );
}
