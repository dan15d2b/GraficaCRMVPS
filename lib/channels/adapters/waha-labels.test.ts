import { describe, expect, it, vi, beforeEach } from "vitest";
import { wahaAdapter } from "./waha";
import * as labelsApi from "@/lib/waha/labels";

vi.mock("@/lib/waha/labels", () => ({
  listarEtiquetasWaha: vi.fn(),
  criarEtiquetaWaha: vi.fn(),
  obterEtiquetasDoChatWaha: vi.fn(),
  definirEtiquetasDoChatWaha: vi.fn(),
  obterChatsPorEtiquetaWaha: vi.fn(),
  hexParaCorWaha: vi.fn().mockReturnValue(18),
  corWahaParaHex: vi.fn().mockReturnValue("#6f6f6f"),
}));

describe("wahaAdapter - gestão de etiquetas", () => {
  const sessionRef = "test_session";
  const chatId = "556199999999@s.whatsapp.net";
  const orgId = "org_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("implementa os métodos opcionais de etiquetas", () => {
    expect(typeof wahaAdapter.syncChatLabels).toBe("function");
    expect(typeof wahaAdapter.listRemoteLabels).toBe("function");
    expect(typeof wahaAdapter.getChatsByRemoteLabel).toBe("function");
  });

  it("syncChatLabels associa etiquetas existentes e cria novas caso faltem", async () => {
    vi.mocked(labelsApi.listarEtiquetasWaha).mockResolvedValue([
      { id: "10", name: "pedido em andamento" },
    ]);
    vi.mocked(labelsApi.criarEtiquetaWaha).mockResolvedValue({
      id: "11",
      name: "Tirar medidas",
    });

    await wahaAdapter.syncChatLabels!({
      sessionRef,
      chatId,
      tags: ["pedido em andamento", "Tirar medidas"],
      orgId,
    });

    expect(labelsApi.listarEtiquetasWaha).toHaveBeenCalledWith(sessionRef);
    expect(labelsApi.criarEtiquetaWaha).toHaveBeenCalledWith(sessionRef, "Tirar medidas", 18);
    expect(labelsApi.definirEtiquetasDoChatWaha).toHaveBeenCalledWith(
      sessionRef,
      chatId,
      ["10", "11"],
    );
  });

  it("syncChatLabels respeita o limite de 20 etiquetas no WhatsApp", async () => {
    // 20 labels já existentes
    const existing = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      name: `tag_${i + 1}`,
    }));
    vi.mocked(labelsApi.listarEtiquetasWaha).mockResolvedValue(existing);

    // Tentar adicionar tag nova quando já atingiu 20
    await wahaAdapter.syncChatLabels!({
      sessionRef,
      chatId,
      tags: ["tag_1", "tag_nova_21"],
      orgId,
    });

    expect(labelsApi.criarEtiquetaWaha).not.toHaveBeenCalled();
    expect(labelsApi.definirEtiquetasDoChatWaha).toHaveBeenCalledWith(
      sessionRef,
      chatId,
      ["1"],
    );
  });
});
