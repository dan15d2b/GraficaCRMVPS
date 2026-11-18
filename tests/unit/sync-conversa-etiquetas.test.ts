import { describe, expect, it, vi, beforeEach } from "vitest";
import { sincronizarEtiquetasDaConversaComCanal } from "@/lib/channels/sync-conversa-etiquetas";
import * as channelsIndex from "@/lib/channels";

vi.mock("@/lib/channels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels")>();
  return {
    ...actual,
    getAdapter: vi.fn(),
  };
});

describe("sincronizarEtiquetasDaConversaComCanal", () => {
  const orgId = "org_123";
  const convId = "conv_456";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("é 100% unidirecional (WhatsApp -> CRM): resolve sem mutar canal remoto", async () => {
    const mockSync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(channelsIndex.getAdapter).mockReturnValue({
      provider: "waha",
      isConfigured: () => true,
      resolveRecipient: () => "556199999999@s.whatsapp.net",
      send: vi.fn(),
      codes: { notConfigured: "x", sendFailed: "y", unknownError: "z" },
      syncChatLabels: mockSync,
    });

    const mockSupabase = {
      from: vi.fn(),
    };

    await sincronizarEtiquetasDaConversaComCanal(
      mockSupabase as never,
      convId,
      orgId,
      ["pedido em andamento"],
    );

    // Na arquitetura 100% unidirecional, o CRM não dispara mutação remota de etiquetas
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("não lança erro se o canal falhar ou não tiver suporte a etiquetas", async () => {
    vi.mocked(channelsIndex.getAdapter).mockReturnValue({
      provider: "waha",
      isConfigured: () => true,
      resolveRecipient: () => "556199999999@s.whatsapp.net",
      send: vi.fn(),
      codes: { notConfigured: "x", sendFailed: "y", unknownError: "z" },
      syncChatLabels: vi.fn().mockRejectedValue(new Error("rede fora")),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: convId,
                  is_group: false,
                  channel_sessions: {
                    provider: "waha",
                    waha_session_name: "test_session",
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    // Deve resolver sem rejeitar
    await expect(
      sincronizarEtiquetasDaConversaComCanal(mockSupabase as never, convId, orgId, ["tag"]),
    ).resolves.toBeUndefined();
  });
});
