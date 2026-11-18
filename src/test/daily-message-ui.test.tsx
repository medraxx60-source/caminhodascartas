import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_FLIP_MS } from "@/lib/daily-message";

vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
import { DailyMessage } from "@/components/DailyMessage";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  vi.stubGlobal("Image", class {
    onload?: () => void;
    set src(_value: string) { this.onload?.(); }
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function open() {
  const view = render(<DailyMessage />);
  await act(async () => {});
  return view;
}
async function finishFlip() { await act(async () => { await vi.advanceTimersByTimeAsync(60 + DAILY_FLIP_MS); }); }

describe("revelações locais para vídeo", () => {
  it("começa com três versos e só mostra o resultado após o flip de 650 ms", async () => {
    const view = await open();
    expect(screen.getAllByRole("button", { name: /Revelar carta/ })).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Mensagem revelada" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revelar carta 1" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    expect(view.container.querySelector('[data-revealed="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mensagem revelada" })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(DAILY_FLIP_MS); });
    expect(screen.getByRole("region", { name: "Mensagem revelada" })).toBeInTheDocument();
  });

  it("revela três cartas, volta e recomeça sem chamadas nem armazenamento", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Revelar carta 1" })); await finishFlip();
    const first = screen.getByRole("heading", { level: 2 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Voltar às 3 cartas" }));
    fireEvent.click(screen.getByRole("button", { name: "Revelar carta 1" })); await finishFlip();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(first);
    fireEvent.click(screen.getByRole("button", { name: "Próxima carta" })); await finishFlip();
    const second = screen.getByRole("heading", { level: 2 }).textContent;
    expect(second).not.toBe(first);
    fireEvent.click(screen.getByRole("button", { name: "Próxima carta" })); await finishFlip();
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(second);
    expect(screen.queryByRole("button", { name: "Próxima carta" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Experimentar gratuitamente/ })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "Recomeçar" }));
    expect(screen.getAllByRole("button", { name: /Revelar carta/ })).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled();
  });

  it("respeita movimento reduzido e bloqueia toques simultâneos", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Revelar carta 3" }));
    expect(screen.getByRole("button", { name: "Revelar carta 1" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(screen.getByRole("region", { name: "Mensagem revelada" })).toBeInTheDocument();
  });
});