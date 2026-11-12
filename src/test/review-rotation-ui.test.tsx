import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewRotation } from "@/components/ReviewRotation";

const reviews = [
  { id: "a", rating: 5, comment: "A primeira avaliação verdadeira.", display_name: "Cliente A" },
  { id: "b", rating: 4, comment: "A segunda avaliação verdadeira.", display_name: null },
];

afterEach(() => vi.useRealTimers());

describe("depoimentos rotativos e estáveis", () => {
  it("mantém ambos os textos originais no HTML e apenas um acessível por vez", () => {
    const { container } = render(<ReviewRotation reviews={reviews} average={4.5} count={2} />);
    const figures = container.querySelectorAll("figure");
    expect(figures).toHaveLength(2);
    expect(figures[0]).toHaveAttribute("aria-hidden", "false");
    expect(figures[1]).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/A primeira avaliação verdadeira/)).toBeInTheDocument();
    expect(screen.getByText(/A segunda avaliação verdadeira/)).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("troca com o controle manual e pausa quando um controle recebe foco", () => {
    vi.useFakeTimers();
    const { container } = render(<ReviewRotation reviews={reviews} average={4.5} count={2} />);
    fireEvent.focus(screen.getByRole("button", { name: "Próxima avaliação" }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima avaliação" }));
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(container.querySelectorAll("figure")[1]).toHaveAttribute("aria-hidden", "false");
  });

  it("avança automaticamente em seis segundos sem exigir mouse no celular", () => {
    vi.useFakeTimers();
    const { container } = render(<ReviewRotation reviews={reviews} average={4.5} count={2} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(container.querySelectorAll("figure")[1]).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByText(/A primeira avaliação verdadeira/)).toBeInTheDocument();
  });

  it("não cria setas nem rotação para um único depoimento", () => {
    render(<ReviewRotation reviews={[reviews[0]!]} average={5} count={1} />);
    expect(screen.queryByRole("button", { name: "Próxima avaliação" })).not.toBeInTheDocument();
  });
});
