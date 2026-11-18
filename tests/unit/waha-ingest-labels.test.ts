import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleLabelChatAssociation } from "@/lib/waha/ingest";
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

describe("handleLabelChatAssociation - ingestão de webhooks de etiqueta", () => {
  const session = {
    id: "session_123",
    organization_id: "org_456",
    waha_session_name: "test_session",
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adiciona tag na conversa quando recebe label.chat.added", async () => {
    vi.mocked(labelsApi.listarEtiquetasWaha).mockResolvedValue([
      { id: "7", name: "Tirar medidas" },
    ]);

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "contacts") {
          const contactQuery = {
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "contact_1" },
                error: null,
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "contact_1" },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue(contactQuery),
                in: vi.fn().mockReturnValue(contactQuery),
                eq: vi.fn().mockReturnValue(contactQuery),
              }),
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "conv_1", tags: ["pedido em andamento"] },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      }),
    };

    await handleLabelChatAssociation(
      mockAdmin as never,
      session,
      {
        event: "label.chat.added",
        session: "test_session",
        payload: {
          chatId: "556199999999@s.whatsapp.net",
          labelId: "7",
        },
      },
      "req_123",
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["pedido em andamento", "tirar medidas"],
      }),
    );
  });

  it("não dispara update se a conversa já possui a tag (anti-loop)", async () => {
    vi.mocked(labelsApi.listarEtiquetasWaha).mockResolvedValue([
      { id: "7", name: "Tirar medidas" },
    ]);

    const mockUpdate = vi.fn();

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "contacts") {
          const contactQuery = {
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "contact_1" },
                error: null,
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "contact_1" },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue(contactQuery),
                in: vi.fn().mockReturnValue(contactQuery),
                eq: vi.fn().mockReturnValue(contactQuery),
              }),
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "conv_1", tags: ["tirar medidas"] },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      }),
    };

    await handleLabelChatAssociation(
      mockAdmin as never,
      session,
      {
        event: "label.chat.added",
        session: "test_session",
        payload: {
          chatId: "556199999999@s.whatsapp.net",
          labelId: "7",
        },
      },
      "req_123",
    );

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("remove tag na conversa quando recebe label.chat.deleted", async () => {
    vi.mocked(labelsApi.listarEtiquetasWaha).mockResolvedValue([
      { id: "7", name: "Tirar medidas" },
    ]);

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "contacts") {
          const contactQuery = {
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "contact_1" },
                error: null,
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "contact_1" },
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue(contactQuery),
                in: vi.fn().mockReturnValue(contactQuery),
                eq: vi.fn().mockReturnValue(contactQuery),
              }),
            }),
          };
        }
        if (table === "conversations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "conv_1", tags: ["tirar medidas", "vip"] },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      }),
    };

    await handleLabelChatAssociation(
      mockAdmin as never,
      session,
      {
        event: "label.chat.deleted",
        session: "test_session",
        payload: {
          chatId: "556199999999@s.whatsapp.net",
          labelId: "7",
        },
      },
      "req_123",
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["vip"],
      }),
    );
  });
});
