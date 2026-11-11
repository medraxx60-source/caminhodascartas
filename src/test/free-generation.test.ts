import { describe, it, expect, vi } from "vitest";
import { runFreeAttempt, FREE_STALE_MS, type FreeAttemptDeps } from "@/lib/free-generation";

// In-memory order/claim that mirrors the conditional DB updates (no AI, no database).
function world(init: { status: string; startedAgoMs?: number } = { status: "pending" }) {
  let t = 1_000_000;
  const o = { status: init.status, started: init.startedAgoMs != null ? t - init.startedAgoMs : 0, reading: null as string | null };
  const claim = { status: "reserved" };
  const ai = vi.fn();
  const deps = (gen: () => Promise<string>): FreeAttemptDeps => ({
    lock: async () => {
      const free = o.reading == null && (o.status === "pending" || o.status === "error" || (o.status === "generating" && o.started < t - FREE_STALE_MS));
      if (!free) return null;
      t += 1; o.status = "generating"; o.started = t;
      return { started: String(t), order: { id: "x", plan: "essencial", cards: [1, 2, 3], question: "q", category: null } };
    },
    generate: async () => { ai(); return gen(); },
    save: async (s, r) => { if (o.status === "generating" && String(o.started) === s && o.reading == null) { o.reading = r; o.status = "done"; return true; } return false; },
    markError: async (s) => { if (o.status === "generating" && String(o.started) === s && o.reading == null) { o.status = "error"; return true; } return false; },
    consume: async () => { if (claim.status === "reserved") claim.status = "consumed"; },
    release: async () => { if (claim.status === "reserved") claim.status = "released"; },
  });
  return { o, claim, ai, deps, advance: (ms: number) => { t += ms; } };
}

describe("retomada segura da leitura grátis", () => {
  it("retoma pedido parado em preparação há mais de 2 minutos", async () => {
    const w = world({ status: "generating", startedAgoMs: FREE_STALE_MS + 1000 });
    expect(await runFreeAttempt(w.deps(async () => "texto"))).toEqual({ ok: true });
    expect(w.o.reading).toBe("texto"); expect(w.claim.status).toBe("consumed");
  });
  it("não retoma antes de 2 minutos (sem chamada duplicada à IA)", async () => {
    const w = world({ status: "generating", startedAgoMs: 60_000 });
    expect((await runFreeAttempt(w.deps(async () => "x"))).busy).toBe(true);
    expect(w.ai).not.toHaveBeenCalled();
  });
  it("duas tentativas simultâneas: só uma chama a IA", async () => {
    const w = world();
    let done!: (s: string) => void;
    const slow = () => new Promise<string>((r) => { done = r; });
    const a = runFreeAttempt(w.deps(slow));
    const b = await runFreeAttempt(w.deps(slow));
    expect(b.busy).toBe(true);
    done("ok"); await a;
    expect(w.ai).toHaveBeenCalledTimes(1); expect(w.claim.status).toBe("consumed");
  });
  it("falha da IA libera a gratuidade e permite nova tentativa", async () => {
    const w = world();
    expect((await runFreeAttempt(w.deps(async () => { throw new Error("timeout"); }))).ok).toBe(false);
    expect(w.o.status).toBe("error"); expect(w.claim.status).toBe("released");
  });
  it("resposta antiga chegando depois de nova tentativa não sobrescreve", async () => {
    const w = world();
    let oldDone!: (s: string) => void;
    const old = runFreeAttempt(w.deps(() => new Promise<string>((r) => { oldDone = r; })));
    await Promise.resolve();
    w.advance(FREE_STALE_MS + 1);
    expect(await runFreeAttempt(w.deps(async () => "nova"))).toEqual({ ok: true });
    oldDone("antiga");
    expect((await old).superseded).toBe(true);
    expect(w.o.reading).toBe("nova");
  });
  it("falha antiga depois do sucesso novo não marca erro nem libera", async () => {
    const w = world();
    let oldFail!: (e: Error) => void;
    const old = runFreeAttempt(w.deps(() => new Promise<string>((_, j) => { oldFail = j; })));
    await Promise.resolve();
    w.advance(FREE_STALE_MS + 1);
    await runFreeAttempt(w.deps(async () => "nova"));
    oldFail(new Error("timeout")); await old;
    expect(w.o.status).toBe("done"); expect(w.claim.status).toBe("consumed");
  });
  it("leitura já concluída não chama a IA de novo", async () => {
    const w = world(); await runFreeAttempt(w.deps(async () => "x"));
    await runFreeAttempt(w.deps(async () => "y"));
    expect(w.ai).toHaveBeenCalledTimes(1); expect(w.o.reading).toBe("x");
  });
});
