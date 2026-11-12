import { describe, expect, it } from "vitest";
import { nextReviewIndex } from "@/lib/review-rotation";

describe("alternância de avaliações aprovadas", () => {
  it("passa pelas avaliações e volta à primeira sem perder a ordem", () => {
    expect(nextReviewIndex(0, 3)).toBe(1);
    expect(nextReviewIndex(1, 3)).toBe(2);
    expect(nextReviewIndex(2, 3)).toBe(0);
  });
  it("permite retroceder com segurança", () => {
    expect(nextReviewIndex(0, 3, -1)).toBe(2);
    expect(nextReviewIndex(2, 3, -1)).toBe(1);
  });
  it("não tenta animar uma lista sem comentários ou com apenas um", () => {
    expect(nextReviewIndex(0, 0)).toBe(0);
    expect(nextReviewIndex(0, 1)).toBe(0);
    expect(nextReviewIndex(Number.NaN, 3)).toBe(1);
  });
});
