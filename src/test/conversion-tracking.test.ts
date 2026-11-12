import { describe, expect, it } from "vitest";
import { cleanCampaignLabel, readCampaignParams, sanitizeConversionContext } from "@/lib/conversion-tracking";
import { summarizeConversionFunnel } from "@/lib/conversion-metrics";

const uuid = "62356161-dfa3-487a-9362-a152bd8c3321";
const uuid2 = "0a0e38a7-e8cb-4587-a6b3-70a311f5e19a";
describe("privacidade e atribuição de conversão", () => {
  it("aceita somente rótulos de marketing, sem pergunta, email ou link privado", () => {
    expect(cleanCampaignLabel("TikTok")).toBe("tiktok");
    expect(cleanCampaignLabel("minha promoção")).toBe("");
    expect(cleanCampaignLabel("cliente@email.com")).toBe("");
    expect(cleanCampaignLabel("/leitura/token")).toBe("");
    expect(readCampaignParams(new URLSearchParams("utm_source=tiktok&utm_medium=organic&utm_campaign=video_01&pergunta=confidencial")))
      .toEqual({ source: "tiktok", medium: "organic", campaign: "video_01" });
  });
  it("valida identificador efêmero e rejeita dados livres", () => {
    expect(sanitizeConversionContext({ sessionId: uuid, source: "Instagram", medium: "Reels", campaign: "test_a" }))
      .toEqual({ sessionId: uuid, source: "instagram", medium: "reels", campaign: "test_a" });
    expect(sanitizeConversionContext({ sessionId: "senha-vazada", source: "a@b.com" }).sessionId).toBeNull();
  });
  it("conta etapas e compras concluídas somente para sessões relacionadas", () => {
    const events = [
      {session_id:uuid,event_name:"landing_view",plan:"none",source:"tiktok",medium:"organic",campaign:"a"},
      {session_id:uuid,event_name:"free_start",plan:"essencial",source:"tiktok",medium:"organic",campaign:"a"},
      {session_id:uuid,event_name:"upgrade_view",plan:"none",source:"tiktok",medium:"organic",campaign:"a"},
      {session_id:uuid,event_name:"upgrade_5",plan:"profunda",source:"tiktok",medium:"organic",campaign:"a"},
      {session_id:uuid2,event_name:"landing_view",plan:"none",source:"instagram",medium:"organic",campaign:"b"},
    ] as const;
    const orders = [
      {conversion_session:uuid,is_free:true,status:"done",plan:"essencial"},
      {conversion_session:uuid,is_free:false,status:"done",plan:"profunda"},
      {conversion_session:uuid2,is_free:true,status:"error",plan:"essencial"},
      {conversion_session:null,is_free:false,status:"done",plan:"profunda"},
    ];
    const s = summarizeConversionFunnel([...events], orders);
    expect(s.visits).toBe(2);
    expect(s.freeStarted).toBe(1);
    expect(s.freeCompleted).toBe(1);
    expect(s.upgradeViewed).toBe(1);
    expect(s.fiveClicks).toBe(1);
    expect(s.paidOrders).toBe(1);
    expect(s.sourceBreakdown).toEqual([
      {source:"tiktok",visitors:1,buyers:1},
      {source:"instagram",visitors:1,buyers:0},
    ]);
  });
});
