import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");

describe("virada de cartas sem reativar animações no restante do site", () => {
  it("mantém bloqueio geral de animações e transições", () => {
    expect(css).toMatch(/\*, \*::before, \*::after\s*\{[^}]*animation: none !important;[^}]*transition: none !important/s);
  });

  it("libera apenas a transição 3D da carta escolhida", () => {
    expect(css).toMatch(/\.cc-card-flip\s*\{[^}]*transition: transform 700ms[^}]*!important;/s);
    expect(page).toContain('className="cc-card-flip relative [transform-style:preserve-3d]"');
    expect(page).toContain('idx >= 0 ? "rotateY(180deg)" : "rotateY(0deg)"');
    expect(page).toContain("center ? idx < 0 && onPick(card) : go(off)");
  });

  it("respeita preferência de reduzir movimento e não altera a tela Pix", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cc-card-flip\s*\{\s*transition: none !important;/s);
    expect(page).toContain('Pagamento Pix');
    expect(page).toContain('Copiar código Pix');
    expect(page).toContain('Tentar gerar Pix');
  });
});
