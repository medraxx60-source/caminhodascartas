import { describe, expect, it } from "vitest";
import { readingTimeoutMs } from "@/lib/reading-timing";

describe("tempo máximo da MandAPI por tiragem", () => {
  it("reduz a espera por requisições travadas nas tiragens de três cartas", () => {
    expect(readingTimeoutMs(3)).toBe(55_000);
  });
  it("preserva mais tempo para cinco e sete cartas", () => {
    expect(readingTimeoutMs(5)).toBe(65_000);
    expect(readingTimeoutMs(7)).toBe(70_000);
  });
  it("todos ficam abaixo do limiar de retomada de 90 segundos", () => {
    expect(Math.max(...[3,5,7].map(readingTimeoutMs))).toBeLessThan(90_000);
  });
});
