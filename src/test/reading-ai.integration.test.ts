import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReadingText } from "@/lib/reading-ai.server";
import { loadOracularReference } from "@/lib/oracular-context.server";
import { getAiModel } from "@/lib/ai-model.server";

vi.mock("@/lib/oracular-context.server", () => ({ loadOracularReference: vi.fn() }));
vi.mock("@/lib/ai-model.server", () => ({ getAiModel: vi.fn() }));

type AiRequest = { model: string; messages: { role: string; content: string }[] };

describe("geração completa com MandAPI simulada (sem cobranças)", () => {
  let calls: AiRequest[];

  beforeEach(() => {
    calls = [];
    vi.stubEnv("MANDAPI_API_KEY", "chave-ficticia-para-teste");
    vi.stubEnv("MANDAPI_BASE_URL", "https://mandapi.example.invalid/v1");
    vi.mocked(loadOracularReference).mockResolvedValue(null);
    vi.mocked(getAiModel).mockResolvedValue("gpt-6-sol");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts: RequestInit) => {
      const payload = JSON.parse(String(opts.body)) as AiRequest;
      calls.push(payload);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Resposta simbólica personalizada de teste." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("mantém prompt e mensagem originais com Base desligada (3 cartas)", async () => {
    const output = await generateReadingText({
      id: "teste-essencial", plan: "essencial", cards: [0, 20, 30],
      question: "Devo aguardar uma resposta profissional?", category: "Trabalho e carreira",
    });
    expect(output).toBe("Resposta simbólica personalizada de teste.");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages).toHaveLength(2);
    expect(calls[0]?.messages[0]?.role).toBe("system");
    expect(calls[0]?.messages[0]?.content).toContain("MOTOR DE INTERPRETAÇÃO — CAMINHO DAS CARTAS");
    const user = calls[0]?.messages[1]?.content ?? "";
    expect(user).toContain("Pergunta do consulente (referência principal da leitura, use exatamente esta pergunta): Devo aguardar uma resposta profissional?");
    expect(user).toContain("1. Situação atual: O Cavaleiro");
    expect(user).toContain("2. Desafio: A Montanha");
    expect(user).toContain("3. Tendência: O Sol");
    expect(user).not.toContain("BASE ORACULAR");
    expect(loadOracularReference).toHaveBeenCalledOnce();
  });

  it("usa base editorial na mensagem do consulente, preservando a pergunta e uma chamada (5 cartas)", async () => {
    vi.mocked(loadOracularReference).mockResolvedValue(
      "1. O Cavaleiro — Passado/Raiz\\nSignificado central: movimento profissional",
    );
    await generateReadingText({
      id: "teste-profunda", plan: "profunda", cards: [0, 1, 2, 3, 4],
      question: "Qual direção minha carreira tende a tomar?", category: "Trabalho e carreira",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("gpt-6-sol");
    const user = calls[0]?.messages[1]?.content ?? "";
    expect(user).toContain("Qual direção minha carreira tende a tomar?");
    expect(user).toContain("1. Passado/Raiz: O Cavaleiro");
    expect(user).toContain("5. Conselho: A Árvore");
    expect(user).toContain("BASE ORACULAR");
    expect(user).toContain("Significado central: movimento profissional");
    expect(user).toContain("FIM DA REFERÊNCIA ORACULAR.");
    expect(calls[0]?.messages[0]?.role).toBe("system");
    expect(calls[0]?.messages[0]?.content).not.toContain("movimento profissional");
  });

  it("funciona com sete cartas mesmo que não existam fichas autorizadas", async () => {
    vi.mocked(loadOracularReference).mockResolvedValue(null);
    await generateReadingText({
      id: "teste-completa", plan: "completa", cards: [0, 1, 2, 3, 4, 5, 6],
      question: "Como lidar com esta decisão?", category: null,
    });
    expect(calls).toHaveLength(1);
    const user = calls[0]?.messages[1]?.content ?? "";
    expect(user).toContain("3. O que está oculto: O Navio");
    expect(user).toContain("7. Desfecho: A Cobra");
    expect(user).not.toContain("BASE ORACULAR");
  });

  it("transforma erro 402 em mensagem clara sem retornar texto falso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Saldo insuficiente", { status: 402 })));
    await expect(generateReadingText({
      id: "teste-erro", plan: "essencial", cards: [0, 1, 2],
      question: "Pergunta de teste?", category: null,
    })).rejects.toThrow("Saldo insuficiente na MandAPI.");
  });
});
