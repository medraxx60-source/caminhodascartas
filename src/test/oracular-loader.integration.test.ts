import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOracularReference } from "@/lib/oracular-context.server";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock },
}));

function createSettingsQuery(enabled: boolean | null, error: unknown = null) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: enabled === null ? null : { value: enabled }, error }),
  };
  return q;
}

function createCardsQuery(cards: unknown[] | null, error: unknown = null) {
  const result = { data: cards, error };
  const q = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

const order = { plan: "essencial" as const, cards: [0, 1, 2], category: "Amor e relacionamentos" };

describe("consulta privada à Base Oracular com Supabase simulado", () => {
  beforeEach(() => fromMock.mockReset());

  it("não busca fichas quando a função estiver desativada", async () => {
    const settings = createSettingsQuery(false);
    fromMock.mockImplementation((table: string) => {
      return table === "app_settings" ? settings : createCardsQuery([]);
    });
    expect(await loadOracularReference(order)).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(settings.eq).toHaveBeenCalledWith("key", "oracular_ai_enabled");
  });

  it("não ativa por padrão se o controle não existir", async () => {
    fromMock.mockReturnValue(createSettingsQuery(null));
    expect(await loadOracularReference(order)).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("consulta só os números sorteados e filtra ficha completa/autorizada", async () => {
    const settings = createSettingsQuery(true);
    const cards = createCardsQuery([{
      card_number: 1,
      name: "O Cavaleiro",
      is_published: true,
      content_status: "completa",
      core_meaning: "Notícias, aproximação e movimento.",
      love_meaning: "Possibilidade de contato.",
      position_meanings: { situacao_atual: "Movimento começando." },
      positive_meaning: null, challenging_meaning: null, prediction_meaning: null,
    }]);
    fromMock.mockImplementation((table: string) => {
      if (table === "app_settings") return settings;
      return table === "lenormand_cards" ? cards : settings;
    });
    const text = await loadOracularReference(order);
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(cards.in).toHaveBeenCalledWith("card_number", [1, 2, 3]);
    expect(cards.eq).toHaveBeenCalledWith("content_status", "completa");
    expect(cards.eq).toHaveBeenCalledWith("is_published", true);
    expect(text).toContain("O Cavaleiro");
    expect(text).toContain("Possibilidade de contato.");
    expect(text).toContain("Movimento começando.");
  });

  it("erro do banco não interrompe geração da leitura", async () => {
    fromMock.mockReturnValue(createSettingsQuery(true, { message: "indisponível" }));
    expect(await loadOracularReference(order)).toBeNull();
  });

  it("consulta de cartas vazia volta ao motor original", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "app_settings" ? createSettingsQuery(true) : createCardsQuery([])
    );
    expect(await loadOracularReference(order)).toBeNull();
  });
});
