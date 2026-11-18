import { describe, it, expect } from "vitest";
import {
  calcularDataEntregaDiasUteis,
  ehFimDeSemana,
  ehFeriadoNacional,
} from "@/lib/orcamentos/dias-uteis";
import {
  parsearOrcamentoTexto,
  gerarMensagemDoOrcamento,
} from "@/lib/orcamentos/parser";

describe("Orçamentos e Prazos Gráficos (Dias Úteis)", () => {
  it("identifica fins de semana e feriados nacionais corretamente", () => {
    // 2026-11-15 é Domingo (Proclamação da República)
    const domingo = new Date("2026-11-15T12:00:00Z");
    expect(ehFimDeSemana(domingo)).toBe(true);
    expect(ehFeriadoNacional(domingo)).toBe(true);

    // 2026-11-20 é Sexta-feira (Dia da Consciência Negra - feriado nacional lei 14.759/2023)
    const sextaFeriado = new Date("2026-11-20T12:00:00Z");
    expect(ehFimDeSemana(sextaFeriado)).toBe(false);
    expect(ehFeriadoNacional(sextaFeriado)).toBe(true);

    // 2026-11-18 é Quarta-feira comum
    const quarta = new Date("2026-11-18T12:00:00Z");
    expect(ehFimDeSemana(quarta)).toBe(false);
    expect(ehFeriadoNacional(quarta)).toBe(false);

    // 2026-04-03 é Sexta-feira Santa (feriado móvel)
    const sextaSanta = new Date("2026-04-03T12:00:00Z");
    expect(ehFimDeSemana(sextaSanta)).toBe(false);
    expect(ehFeriadoNacional(sextaSanta)).toBe(true);
  });

  it("calcula prazo pulando fins de semana e feriados", () => {
    // Começando na Quarta-feira 18/11/2026
    // Dia 1: Quinta 19/11
    // Dia 2: Sexta 20/11 é FERIADO (Consciência Negra) -> pula!
    // Sábado 21/11 e Domingo 22/11 -> pula!
    // Dia 2: Segunda 23/11
    // Dia 3: Terça 24/11
    const inicio = new Date("2026-11-18T12:00:00Z");
    const resultado3Dias = calcularDataEntregaDiasUteis(inicio, 3);

    expect(resultado3Dias.diasUteis).toBe(3);
    expect(resultado3Dias.formatadaCurta).toContain("24/11/2026");
    expect(resultado3Dias.formatadaExtenso.toLowerCase()).toContain("terça-feira");
  });

  it("extrai dados de orçamento por texto heurístico", async () => {
    const textoExemplo = `
      ORÇAMENTO Nº 10582
      Cliente: João Silva
      
      Itens do Pedido:
      1. 1000x Cartão de Visita Couchê 300g 4x4 Verniz Localizado - R$ 145,00
      2. 2x Banner Lona 440g 80x120cm c/ bastão e cordão - R$ 110,00
      
      Valor Total: R$ 255,00
      Forma de Pagamento: 50% de entrada no PIX e restante na retirada
      Prazo de Entrega: 4 dias úteis após aprovação da arte
    `;

    const extraido = await parsearOrcamentoTexto(textoExemplo);

    expect(extraido.numero_orcamento).toBe("10582");
    expect(extraido.valor_total_cents).toBe(25500);
    expect(extraido.prazo_dias_uteis).toBe(4);
    expect(extraido.forma_pagamento).toContain("50% de entrada");
    expect(extraido.itens.length).toBeGreaterThanOrEqual(1);

    // Mensagem formatada deve conter elementos essenciais para WhatsApp
    expect(extraido.mensagem_sugerida).toContain("R$ 255,00");
    expect(extraido.mensagem_sugerida).toContain("4 dias úteis");
    expect(extraido.mensagem_sugerida).toContain("10582");
  });

  it("gera mensagem comercial para WhatsApp com prazo e itens claros", () => {
    const msg = gerarMensagemDoOrcamento({
      numero_orcamento: "4020",
      itens: [
        {
          descricao: "Adesivo Vinil Brilho recorte eletrônico",
          quantidade: 500,
          medidas: "5x5cm",
          valor_unitario_cents: 80,
          valor_total_cents: 40000,
        },
      ],
      valor_total_cents: 40000,
      forma_pagamento: "PIX à vista com 5% de desconto",
      prazo_dias_uteis: 3,
      data_estimada_entrega_formatada: "25/11/2026",
    });

    expect(msg).toContain("#4020");
    expect(msg).toContain("Adesivo Vinil Brilho");
    expect(msg).toContain("R$ 400,00");
    expect(msg).toContain("3 dias úteis");
    expect(msg).toContain("25/11/2026");
    expect(msg).toContain("PIX à vista");
    expect(msg).toContain("Posso confirmar e gerar a Ordem de Serviço para você?");
  });
});
