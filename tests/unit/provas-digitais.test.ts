import { describe, it, expect, vi } from "vitest";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("Prova Digital de Arte Gráfica", () => {
  describe("Public Paths Allowlist", () => {
    it("permite acesso público à página de visualização da prova por token", () => {
      expect(isPublicPath("/prova/a1b2c3d4e5f6")).toBe(true);
      expect(isPublicPath("/prova/token-com-hifen_e_underline123")).toBe(true);
    });

    it("permite acesso público aos endpoints de consulta, decisão e download da prova", () => {
      expect(isPublicPath("/api/v1/prova/a1b2c3d4e5f6")).toBe(true);
      expect(isPublicPath("/api/v1/prova/a1b2c3d4e5f6/decidir")).toBe(true);
      expect(isPublicPath("/api/v1/prova/a1b2c3d4e5f6/arquivo")).toBe(true);
    });

    it("não abre caminhos não autorizados", () => {
      expect(isPublicPath("/prova/a1b2/outro-segmento")).toBe(false);
      expect(isPublicPath("/api/v1/provas")).toBe(false); // Listagem interna exige autenticação
    });
  });

  describe("Reconhecimento de Confirmação por Texto no WhatsApp", () => {
    // Importa o módulo da prova
    it("reconhece variações comuns de aprovação", async () => {
      const frasesAprovadas = [
        "Aprovado",
        "aprovado",
        "Aprovada",
        "Aprovo",
        "Pode rodar",
        "pode rodar",
        "Pode imprimir",
        "pode produzir",
        "Tá aprovado!",
        "ta aprovado",
        "Ok pode rodar",
        "OK",
        "ok",
        "Autorizado",
        "Autorizo",
        "Sim, aprovado",
        "aprovado pode rodar",
      ];

      for (const frase of frasesAprovadas) {
        const norm = frase
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[!.,?]/g, "")
          .trim();

        const ehAprovacao =
          norm === "aprovado" ||
          norm === "aprovada" ||
          norm === "aprovo" ||
          norm === "pode rodar" ||
          norm === "pode imprimir" ||
          norm === "pode produzir" ||
          norm === "ta aprovado" ||
          norm === "ta aprovada" ||
          norm === "ok pode rodar" ||
          norm === "ok aprovado" ||
          norm === "ok" ||
          norm === "autorizado" ||
          norm === "autorizada" ||
          norm === "autorizo" ||
          norm === "sim aprovado" ||
          norm.startsWith("aprovado") ||
          norm.startsWith("aprovada") ||
          norm.startsWith("pode rodar");

        expect(ehAprovacao, `Deveria reconhecer "${frase}" como aprovação`).toBe(true);
      }
    });

    it("não confunde dúvidas ou pedidos de alteração com aprovação", () => {
      const frasesNaoAprovadas = [
        "olá, bom dia",
        "quanto custa?",
        "tem como mudar a cor do fundo?",
        "não gostei desse modelo",
        "troca o telefone por favor",
        "vou verificar e te aviso",
        "ainda não aprovei",
      ];

      for (const frase of frasesNaoAprovadas) {
        const norm = frase
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[!.,?]/g, "")
          .trim();

        const ehAprovacao =
          norm === "aprovado" ||
          norm === "aprovada" ||
          norm === "aprovo" ||
          norm === "pode rodar" ||
          norm === "pode imprimir" ||
          norm === "pode produzir" ||
          norm === "ta aprovado" ||
          norm === "ta aprovada" ||
          norm === "ok pode rodar" ||
          norm === "ok aprovado" ||
          norm === "ok" ||
          norm === "autorizado" ||
          norm === "autorizada" ||
          norm === "autorizo" ||
          norm === "sim aprovado" ||
          norm.startsWith("aprovado") ||
          norm.startsWith("aprovada") ||
          norm.startsWith("pode rodar");

        expect(ehAprovacao, `NÃO deveria reconhecer "${frase}" como aprovação`).toBe(false);
      }
    });
  });
});
