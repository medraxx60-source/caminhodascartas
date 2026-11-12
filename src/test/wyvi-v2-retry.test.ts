import { afterEach, describe, expect, it, vi } from "vitest";
import { createAsaasPix, findAsaasPayment, parseWyviPixResponse } from "@/lib/asaas.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const txid = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const brcode = "00020101021226880014br.gov.bcb.pix0109123456789020452040000530398654058.905802BR5904TEST6004CITY6304A1B2";
const opts = { orderId:"11111111-2222-4333-8444-555555555555",orderCode:"11111111",valueCents:890 };

describe("Pix Wyvi oficial com recuperação segura", () => {
  it("interpreta resposta v2 com QR e também replay sem imagem", () => {
    expect(parseWyviPixResponse({ txid, pix: { copia_e_cola: brcode, qrcode:"data:image/png;base64,aW1n" } }))
      .toEqual({ id:"wy:"+txid, payload:brcode,image:"aW1n" });
    expect(parseWyviPixResponse({ txid, pix: { copia_e_cola: brcode } }))
      .toEqual({ id:"wy:"+txid, payload:brcode,image:null });
  });
  it("mantém compatibilidade com respostas antigas v1", () => {
    expect(parseWyviPixResponse({ data: {txid,copia_e_cola:brcode} }))
      .toEqual({id:"wy:"+txid,payload:brcode,image:null});
    expect(parseWyviPixResponse({ txid, pix: { copia_e_cola:"invalido" } })).toBeNull();
    expect(parseWyviPixResponse({ pix: { copia_e_cola:brcode } })).toBeNull();
  });
  it("cria cobranças novas pela API v2, sem dados pessoais, com idempotência por pedido", async () => {
    vi.stubEnv("WIVYPAY_API_KEY","wy_live_test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({txid,pix:{copia_e_cola:brcode}}),{status:201}));
    vi.stubGlobal("fetch",fetchMock);
    const result = await createAsaasPix({...opts,apiVersion:"v2"});
    expect(result?.payload).toBe(brcode);
    const [url,init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.wyvipay.com.br/api/v2/cobrancas");
    expect(init.headers["Idempotency-Key"]).toBe("pedido-"+opts.orderId);
    const body = JSON.parse(init.body);
    expect(body.expira_em_segundos).toBe(86400);
    expect(body).not.toHaveProperty("expiracao_segundos");
    expect(body).not.toHaveProperty("pergunta");
    expect(body.valor_centavos).toBe(890);
  });
  it("repete pedido antigo pela versão v1 com o mesmo conteúdo e mesma chave",async()=>{
    vi.stubEnv("WIVYPAY_API_KEY","wy_live_test");
    const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({txid,copia_e_cola:brcode}),{status:200}));
    vi.stubGlobal("fetch",mock);
    const v=await createAsaasPix({...opts,apiVersion:"v1"});
    expect(v?.id).toBe("wy:"+txid);
    const [url,init] = mock.mock.calls[0]!;
    expect(url).toContain("/api/v1/cobrancas");
    expect(init.headers["Idempotency-Key"]).toBe("pedido-"+opts.orderId);
    const body=JSON.parse(init.body);
    expect(body.expiracao_segundos).toBe(86400);
    expect(body).not.toHaveProperty("expira_em_segundos");
  });
  it("não cria cobrança nem usa Asaas se a chave oficial da Wyvi estiver ausente",async()=>{
    vi.stubEnv("WIVYPAY_API_KEY","");
    const mock=vi.fn();
    vi.stubGlobal("fetch",mock);
    expect(await createAsaasPix(opts)).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });
  it("confirma pagamentos Wyvi somente com valor suficiente e situação concluída",async()=>{
    vi.stubEnv("WIVYPAY_API_KEY","wy_live_test");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({txid,situacao:"concluida",valor_centavos:890}),{status:200})));
    expect(await findAsaasPayment("wy:"+txid,890)).toBe("wy:"+txid);
    expect(await findAsaasPayment("wy:"+txid,1490)).toBeNull();
  });
});
