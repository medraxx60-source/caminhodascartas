import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewRotation } from "@/components/ReviewRotation";

const reviews = [
  { id: "a", rating: 5, comment: "A primeira avaliação verdadeira.", display_name: "Cliente A" },
  { id: "b", rating: 4, comment: "A segunda avaliação verdadeira.", display_name: null },
];

describe("depoimentos estáticos sem animação", () => {
  it("exibe todos os depoimentos reais imediatamente sem animação ou temporizador", () => {
    const { container } = render(<ReviewRotation reviews={reviews} average={4.5} count={2} />);
    const figures = container.querySelectorAll("figure");
    expect(figures).toHaveLength(2);
    expect(screen.getByText(/A primeira avaliação verdadeira/)).toBeInTheDocument();
    expect(screen.getByText(/A segunda avaliação verdadeira/)).toBeInTheDocument();
    expect(screen.getByText(/4,5\/5/)).toBeInTheDocument();
    expect(container.querySelector(".cc-review-clock")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Próxima avaliação" })).not.toBeInTheDocument();
  });

  it("não inventa conteúdo, usa apenas avaliações com comentário", () => {
    const { container } = render(<ReviewRotation reviews={[reviews[0]!, {id:"c",rating:5,comment:null,display_name:null}]} average={5} count={2} />);
    expect(container.querySelectorAll("figure")).toHaveLength(1);
  });

  it("não apresenta bloco vazio quando nenhuma avaliação tem comentário", () => {
    const { container } = render(<ReviewRotation reviews={[{id:"c",rating:5,comment:null,display_name:null}]} average={5} count={1} />);
    expect(container.innerHTML).toBe("");
  });
});
