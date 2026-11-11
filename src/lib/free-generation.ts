// One attempt at generating a free reading. DB access is injected so the rules can be tested without AI or DB.
// Each attempt is identified by its generation_started_at; only the current attempt may save or fail the order.
export const FREE_STALE_MS = 2 * 60 * 1000; // a "generating" free order with no progress for 2 min can be retaken

export type FreeOrder = { id: string; plan: string; cards: number[]; question: string; category: string | null };
export type FreeAttemptDeps = {
  lock(): Promise<{ started: string; order: FreeOrder } | null>; // atomic: pending/error, or generating older than FREE_STALE_MS
  generate(o: FreeOrder): Promise<string>;
  save(started: string, reading: string): Promise<boolean>; // true only if this attempt is still current and no reading exists
  markError(started: string, msg: string): Promise<boolean>; // same condition as save
  consume(): Promise<void>;
  release(): Promise<void>;
};

export async function runFreeAttempt(d: FreeAttemptDeps): Promise<{ ok: boolean; busy?: boolean; superseded?: boolean }> {
  const a = await d.lock();
  if (!a) return { ok: true, busy: true }; // another attempt is running or the reading is done
  let reading: string;
  try {
    reading = await d.generate(a.order);
  } catch (e) {
    if (await d.markError(a.started, e instanceof Error ? e.message : "falha")) await d.release();
    return { ok: false };
  }
  let saved = false;
  try { saved = await d.save(a.started, reading); } catch {
    if (await d.markError(a.started, "Falha ao salvar a leitura")) await d.release();
    return { ok: false };
  }
  if (!saved) return { ok: true, superseded: true }; // a newer attempt owns the order; never overwrite
  await d.consume();
  return { ok: true };
}
