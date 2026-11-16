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

  it("chama syncChatLabels do adapter com sessionRef e chatId resolvidos", async () => {
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
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: convId,
                  is_group: false,
                  group_chat_id: null,
                  channel: "whatsapp",
                  contacts: { phone_number: "+556199999999", wa_identity: null, wa_lid: null },
                  channel_sessions: {
                    provider: "waha",
                    waha_session_name: "test_session",
                    meta_phone_number_id: null,
                    zernio_account_id: null,
                    datafy_phone_number_id: null,
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await sincronizarEtiquetasDaConversaComCanal(
      mockSupabase as never,
      convId,
      orgId,
      ["pedido em andamento"],
    );

    expect(mockSync).toHaveBeenCalledWith({
      sessionRef: "test_session",
      chatId: "556199999999@s.whatsapp.net",
      tags: ["pedido em andamento"],
      orgId,
    });
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
