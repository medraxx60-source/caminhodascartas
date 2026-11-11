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
