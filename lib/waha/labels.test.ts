import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  corWahaParaHex,
  hexParaCorWaha,
  listarEtiquetasWaha,
  criarEtiquetaWaha,
  definirEtiquetasDoChatWaha,
  type WahaLabel,
} from "./labels";

describe("mapeamento de cores entre Deskcomm e WhatsApp", () => {
  it("converte hex do Deskcomm para índice do WhatsApp", () => {
    expect(hexParaCorWaha("#0091ff")).toBe(1); // Azul
    expect(hexParaCorWaha("#ffe629")).toBe(2); // Amarelo
    expect(hexParaCorWaha("#ffb224")).toBe(3); // Âmbar
    expect(hexParaCorWaha("#3e63dd")).toBe(8); // Índigo
    expect(hexParaCorWaha("#00655a")).toBe(12); // Verde-água
    expect(hexParaCorWaha("#cf3716")).toBe(13); // Vermelho
    expect(hexParaCorWaha("#6f6f6f")).toBe(18); // Cinza
    expect(hexParaCorWaha("#ab4aba")).toBe(19); // Roxo
  });

  it("converte índice do WhatsApp para hex do Deskcomm", () => {
    expect(corWahaParaHex(1)).toBe("#0091ff");
    expect(corWahaParaHex(2)).toBe("#ffe629");
    expect(corWahaParaHex(3)).toBe("#ffb224");
    expect(corWahaParaHex(8)).toBe("#3e63dd");
    expect(corWahaParaHex(12)).toBe("#00655a");
    expect(corWahaParaHex(13)).toBe("#cf3716");
    expect(corWahaParaHex(18)).toBe("#6f6f6f");
    expect(corWahaParaHex(19)).toBe("#ab4aba");
    // Fallback para cor não mapeada
    expect(corWahaParaHex(999)).toBe("#6f6f6f");
  });
});

describe("cliente WAHA de etiquetas", () => {
  const session = "test_session";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("listarEtiquetasWaha chama GET /api/:session/labels", async () => {
    const mockLabels: WahaLabel[] = [
      { id: "1", name: "pedido em andamento", color: 19, colorHex: "#9368cf" },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLabels,
    });

    const labels = await listarEtiquetasWaha(session);
    expect(labels).toEqual(mockLabels);
  });

  it("criarEtiquetaWaha chama POST /api/:session/labels", async () => {
    const mockCreated: WahaLabel = { id: "2", name: "Tirar medidas", color: 12 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCreated,
    });

    const label = await criarEtiquetaWaha(session, "Tirar medidas", 12);
    expect(label).toEqual(mockCreated);
  });

  it("definirEtiquetasDoChatWaha chama PUT /api/:session/labels/chats/:chatId", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await definirEtiquetasDoChatWaha(session, "556199999999@s.whatsapp.net", ["1", "2"]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/test_session/labels/chats/556199999999%40s.whatsapp.net"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ labels: [{ id: "1" }, { id: "2" }] }),
      }),
    );
  });
});
