import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkFree: vi.fn(), createFree: vi.fn(), createPaid: vi.fn(), track: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({
  checkFreeReading: mocks.checkFree,
  createFreeOrder: mocks.createFree,
  createOrder: mocks.createPaid,
  retryAutomaticPix: vi.fn(), getOrderStatus: vi.fn(),
}));
vi.mock("@/lib/device-fingerprint", () => ({ getDeviceFingerprint: async () => undefined }));
vi.mock("@/lib/use-conversion", () => ({ useConversion: () => mocks.track }));
vi.mock("@/components/HomeTrust", () => ({ HomeTrust: () => null, HomeProof: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: {} } }));

import { Route } from "@/routes/index";
const Home = Route.options.component as ComponentType;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  mocks.checkFree.mockResolvedValue({ enabled: true, eligible: true, reason: "eligible" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const planButton = (count: number) => screen.getByRole("button", { name: new RegExp(`${count} cartas ·`) });

describe("CTA principal gratuito da home", () => {
  for (const count of [5, 7]) {
    it(`substitui o plano pago de ${count} cartas pelo gratuito após voltar à home, preservando pergunta própria`, async () => {
      render(<Home />);
      fireEvent.click(await screen.findByRole("button", { name: "Experimentar gratuitamente" }));
      fireEvent.click(screen.getByRole("button", { name: "Amor e relacionamentos" }));
      expect(screen.getByRole("textbox")).toHaveValue("");
      const question = "Como posso melhorar minha comunicação com minha família?";
      fireEvent.change(screen.getByRole("textbox"), { target: { value: question } });
      fireEvent.click(planButton(count));
      expect(planButton(count)).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      fireEvent.click(screen.getByRole("button", { name: "Experimentar gratuitamente" }));
      expect(planButton(3)).toHaveAttribute("aria-pressed", "true");
      expect(planButton(count)).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("textbox")).toHaveValue(question);
      expect(mocks.createFree).not.toHaveBeenCalled();
      expect(mocks.createPaid).not.toHaveBeenCalled();
    });
  }

  it("mantém o plano pago anterior quando o visitante não é elegível", async () => {
    mocks.checkFree.mockResolvedValue({ enabled: true, eligible: false, reason: "device_already_used" });
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Conhecer planos e valores" }));
    fireEvent.click(planButton(7));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(screen.getByRole("button", { name: "Conhecer planos e valores" }));
    expect(planButton(7)).toHaveAttribute("aria-pressed", "true");
    expect(mocks.createFree).not.toHaveBeenCalled();
    expect(mocks.createPaid).not.toHaveBeenCalled();
  });

  for (const entry of ["✦ Abrir minha mesa de cartas", "Trabalho e carreira"]) {
    it(`preserva o plano anterior ao entrar por ${entry}`, async () => {
      render(<Home />);
      fireEvent.click(await screen.findByRole("button", { name: "Experimentar gratuitamente" }));
      fireEvent.click(planButton(5));
      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      fireEvent.click(screen.getByRole("button", { name: entry }));
      await waitFor(() => expect(planButton(5)).toHaveAttribute("aria-pressed", "true"));
      if (entry === "Trabalho e carreira") expect(screen.getByRole("textbox")).toHaveValue("");
      expect(mocks.createFree).not.toHaveBeenCalled();
      expect(mocks.createPaid).not.toHaveBeenCalled();
    });
  }
});