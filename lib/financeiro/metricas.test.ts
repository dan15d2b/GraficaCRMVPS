import { describe, expect, it } from "vitest";
import {
  calcularMetricasFinanceiras,
  classificarMaterial,
  type LeadFinanceiro,
} from "./metricas";

describe("metricas financeiras da gráfica", () => {
  const agora = new Date("2026-11-16T12:00:00Z");

  const leadsMock: LeadFinanceiro[] = [
    // 1. Pedido concluído no mês atual (Novembro 2026)
    {
      id: "1",
      title: "#000980 2 Lonas com ilhós 3x2m",
      value_cents: 150000, // R$ 1.500,00
      stage_id: "stage-concluido",
      stage_name: "Concluído",
      stage_slug: "concluido",
      is_won: true,
      status: "won",
      created_at: "2026-11-02T10:00:00Z",
      updated_at: "2026-11-05T14:00:00Z",
      stage_changed_at: "2026-11-05T14:00:00Z",
    },
    // 2. Outro pedido concluído no mês atual
    {
      id: "2",
      title: "#000983 20 Revista - Proposta MB V14",
      value_cents: 160000, // R$ 1.600,00
      stage_id: "stage-concluido",
      stage_name: "Concluído",
      stage_slug: "concluido",
      is_won: true,
      status: "won",
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-12T16:00:00Z",
      stage_changed_at: "2026-11-12T16:00:00Z",
    },
    // 3. Pedido em Produção (mês atual)
    {
      id: "3",
      title: "#000997 1 Adesivo Impresso | 3.000 Panfletos A4",
      value_cents: 27000, // R$ 270,00
      stage_id: "stage-producao",
      stage_name: "Em Produção",
      stage_slug: "em-producao",
      is_producao: true,
      status: "open",
      created_at: "2026-11-14T09:00:00Z",
      updated_at: "2026-11-15T10:00:00Z",
    },
    // 4. Pedido em Proposta / Orçamento aberto
    {
      id: "4",
      title: "#000984 50 Cadernos",
      value_cents: 1200000, // R$ 12.000,00
      stage_id: "stage-proposta",
      stage_name: "Acompanhar Proposta",
      stage_slug: "acompanhar-proposta",
      is_proposta: true,
      status: "open",
      created_at: "2026-11-15T11:00:00Z",
      updated_at: "2026-11-15T11:00:00Z",
    },
    // 5. Pedido concluído no mês anterior (Outubro 2026)
    {
      id: "5",
      title: "#000950 1000 Cartões de visita",
      value_cents: 200000, // R$ 2.000,00
      stage_id: "stage-concluido",
      stage_name: "Concluído",
      stage_slug: "concluido",
      is_won: true,
      status: "won",
      created_at: "2026-10-10T10:00:00Z",
      updated_at: "2026-10-20T10:00:00Z",
      stage_changed_at: "2026-10-20T10:00:00Z",
    },
  ];

  it("classifica categoria de material pelo título ou itens", () => {
    expect(classificarMaterial("1 Lona com ilhós e acabamento")).toBe("Lonas & Banners");
    expect(classificarMaterial("1000 Panfletos 10x15 frente")).toBe("Panfletos & Folhetos");
    expect(classificarMaterial("Adesivo em vinil leitoso")).toBe("Adesivos & Rótulos");
    expect(classificarMaterial("Cartão de visita 4x4 couché")).toBe("Cartões de Visita");
    expect(classificarMaterial("20 Revistas com grampo")).toBe("Revistas & Cadernos");
    expect(classificarMaterial("Serviço de corte laser")).toBe("Outros Materiais");
  });

  it("calcula faturamento do mês atual e do mês anterior", () => {
    const metricas = calcularMetricasFinanceiras(leadsMock, agora);

    // Mês atual: lead 1 (1.500) + lead 2 (1.600) = R$ 3.100,00 (310.000 cents)
    expect(metricas.faturamentoMesAtualCents).toBe(310000);
    // Mês anterior: lead 5 = R$ 2.000,00 (200.000 cents)
    expect(metricas.faturamentoMesAnteriorCents).toBe(200000);
    // Variação MoM: (3100 - 2000) / 2000 = +55%
    expect(metricas.variacaoMoMPercent).toBe(55);
  });

  it("calcula em produção e propostas abertas", () => {
    const metricas = calcularMetricasFinanceiras(leadsMock, agora);

    // Em produção: lead 3 = 27.000 cents
    expect(metricas.emProducaoCents).toBe(27000);
    expect(metricas.emProducaoCount).toBe(1);

    // Propostas abertas: lead 4 = 1.200.000 cents
    expect(metricas.propostasAbertasCents).toBe(1200000);
    expect(metricas.propostasAbertasCount).toBe(1);
  });

  it("calcula ticket médio do mês", () => {
    const metricas = calcularMetricasFinanceiras(leadsMock, agora);

    // 310.000 cents / 2 pedidos = 155.000 cents (R$ 1.550,00)
    expect(metricas.ticketMedioCents).toBe(155000);
    expect(metricas.pedidosFechadosMesAtualCount).toBe(2);
  });

  it("calcula projeção realista, conservadora e otimista para o próximo mês", () => {
    const metricas = calcularMetricasFinanceiras(leadsMock, agora);

    expect(metricas.projecaoProximoMesCents).toBeGreaterThan(0);
    expect(metricas.projecaoConservadoraCents).toBeLessThanOrEqual(metricas.projecaoProximoMesCents);
    expect(metricas.projecaoOtimistaCents).toBeGreaterThanOrEqual(metricas.projecaoProximoMesCents);
  });

  it("gera comparativo mensal dos últimos 6 meses", () => {
    const metricas = calcularMetricasFinanceiras(leadsMock, agora);

    expect(metricas.comparativoMensal).toHaveLength(6);
    const mesAtual = metricas.comparativoMensal[5];
    expect(mesAtual?.anoMes).toBe("2026-11");
    expect(mesAtual?.faturadoCents).toBe(310000);
  });
});
