import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as requireRoleModule from "@/lib/auth/require-role";
import * as channelsIndex from "@/lib/channels";
import * as serverSupabase from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/channels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/channels")>();
  return {
    ...actual,
    getAdapter: vi.fn(),
  };
});

describe("POST /api/v1/channels/labels/import", () => {
  const orgId = "org_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recusa requisição sem papel de manager", async () => {
    vi.mocked(requireRoleModule.requireRole).mockResolvedValue({
      ok: false,
      response: new Response("Forbidden", { status: 403 }),
    } as never);

    const res = await POST(new Request("http://localhost/api/v1/channels/labels/import", { method: "POST" }) as never);
    expect(res.status).toBe(403);
  });

  it("importa etiquetas remotas e atualiza vocabulário da org", async () => {
    vi.mocked(requireRoleModule.requireRole).mockResolvedValue({
      ok: true,
      org: { orgId, role: "manager" },
    } as never);

    const mockListRemoteLabels = vi.fn().mockResolvedValue([
      { id: "1", name: "pedido em andamento", color: 19, colorHex: "#9368cf" },
      { id: "2", name: "Tirar medidas", color: 12 },
    ]);
    const mockGetChatsByRemoteLabel = vi.fn().mockResolvedValue([]);

    vi.mocked(channelsIndex.getAdapter).mockReturnValue({
      provider: "waha",
      isConfigured: () => true,
      resolveRecipient: () => null,
      send: vi.fn(),
      codes: { notConfigured: "x", sendFailed: "y", unknownError: "z" },
      listRemoteLabels: mockListRemoteLabels,
      getChatsByRemoteLabel: mockGetChatsByRemoteLabel,
    });

    const mockUpdateOrg = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "channel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: "sess_1",
                        provider: "waha",
                        waha_session_name: "test_session",
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    settings: {
                      canonical_conversation_tags: [],
                    },
                  },
                  error: null,
                }),
              }),
            }),
            update: mockUpdateOrg,
          };
        }
        return {};
      }),
    };

    vi.mocked(serverSupabase.createClient).mockResolvedValue(mockSupabase as never);

    const res = await POST(new Request("http://localhost/api/v1/channels/labels/import", { method: "POST" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual({
      etiquetas_importadas: 2,
      conversas_etiquetadas: 0,
    });

    expect(mockUpdateOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          canonical_conversation_tags: ["pedido em andamento", "Tirar medidas"],
          tags: [
            { tag: "pedido em andamento", cor: "#9368cf" },
            { tag: "Tirar medidas", cor: "#00655a" },
          ],
        }),
      }),
    );
  });
});
