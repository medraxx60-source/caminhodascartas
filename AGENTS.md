<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Paid Pix uses Wyvi Pay when WIVYPAY_API_KEY is set (ids stored as "wy:<txid>" in asaas_qr_id), Asaas otherwise; QR is rendered in the browser from the copia-e-cola. Why: one provider switch, no extra columns.
- Serve the Pix QR from a bundled file in `src/assets` (never a CDN asset pointer — those returned 403). The supplied QR photo is white-on-black with no quiet zone, so it must be inverted to black-on-white and padded with a white margin before display, then verified to decode.
- Free first reading lives in its own server functions (`checkFreeReading`, `createFreeOrder`, `runFreeGeneration`) and the `reserve_free_reading` DB function; never route it through `createOrder`, Pix, Telegram or admin approval. Why: paid flow must stay untouched.
- The AI prompt/call is shared in `src/lib/reading-ai.server.ts` for both paid and free readings. Why: one prompt to maintain.
- Base Oracular: private admin-only table lenormand_cards (no INSERT/DELETE grants, keeps exactly 36 rows); content_status is computed by a DB trigger. When admin opts in via `app_settings.oracular_ai_enabled=true`, only complete + is_published selected cards are passed as short editorial reference in the **user message** for the existing one-call MandAPI reading. If disabled/missing/unavailable, use original prompt without reference. No card content is exposed on public pages. The system instructions in `reading-ai.server.ts` must remain unchanged unless explicitly authorized.
- Free reading network limit lives in `src/lib/free-eligibility.ts` (limit + rolling window) and must match `reserve_free_reading` in the DB; check, reserve and resume all pass the same limit. Why: no divergence between screens.
- Free generation attempts run through `runFreeAttempt` in `src/lib/free-generation.ts`; each attempt is keyed by `generation_started_at` and may only save/fail while it is still current. Why: stale or late responses never overwrite a newer attempt.
- Free-flow progress (plan, question, cards, step) is kept only in sessionStorage via `src/lib/free-progress.ts` (1h TTL, cleared on order/restart), never in the URL; it never decides eligibility. Why: survives reloads without leaking between tabs/users.
