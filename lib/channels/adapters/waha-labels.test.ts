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

  it("syncChatLabels é no-op para garantir sincronia 100% unidirecional (WhatsApp -> CRM)", async () => {
    await wahaAdapter.syncChatLabels!({
      sessionRef,
      chatId,
      tags: ["pedido em andamento", "Tirar medidas"],
      orgId,
    });

    // Na arquitetura 100% unidirecional, nenhuma mutação remota é enviada ao WhatsApp
    expect(labelsApi.criarEtiquetaWaha).not.toHaveBeenCalled();
    expect(labelsApi.definirEtiquetasDoChatWaha).not.toHaveBeenCalled();
  });
});
