import { describe, expect, it } from "vitest";
import { extrairOrcamentoGrafico, somarDiasUteis } from "./orcamento-grafico";

describe("orcamento-grafico", () => {
  it("calcula soma de dias úteis pulando fins de semana", () => {
    // 2026-11-16 é segunda-feira
    const seg = new Date("2026-11-16T12:00:00Z");
    const sex = somarDiasUteis(seg, 4); // Sex 20/11
    expect(sex.toISOString().split("T")[0]).toBe("2026-11-20");

    const segSeguinte = somarDiasUteis(seg, 5); // Seg 23/11 (pulando sab e dom)
    expect(segSeguinte.toISOString().split("T")[0]).toBe("2026-11-23");
  });

  it("extrai orçamento real de Lonas / Placas Metalon", () => {
    const texto = `
Brasília, 16/11/2026
À Jhon Carvalho
At. 77 8124-2360
Fone : (77)8124-2360 Cel/Fax : (77)8124-2360
Apresentamos a seguir, nossa proposta comercial referente aos itens solicitados.
Item(ns) solicitado(s) do orçamento : 000995.
02) 3 Lona - Placas Metalon
2x1mt, 4x0 cores, Tinta Digital em Lona Front Brilho 440g.
Refilar, Instalação Inclusa.
Total: R$ 1.560,00 Unit: 520,00 Pgto: A combinar Entrega 3 dias úteis, após aprovação da arte.
Orçamentista : Daniel -Validade da proposta : 30 dias
Forma de pagamento: dinheiro ou pix
Condição de pagamento: 50% de entrada e 50% na retirada.
    `;

    const dataBase = new Date("2026-11-16T12:00:00Z");
    const r = extrairOrcamentoGrafico(texto, dataBase);

    expect(r).not.toBeNull();
    expect(r?.numero).toBe("000995");
    expect(r?.cliente).toBe("Jhon Carvalho");
    expect(r?.valorCents).toBe(156000);
    expect(r?.valorFormatado).toBe("R$ 1.560,00");
    expect(r?.prazoDiasUteis).toBe(3);
    expect(r?.prazoTexto).toBe("3 dias úteis, após aprovação da arte");
    expect(r?.dataEstimadaIso).toBe("2026-11-19");
    expect(r?.condicaoPagamento).toBe("50% de entrada e 50% na retirada");
    expect(r?.formaPagamento).toBe("dinheiro ou pix");
    expect(r?.orcamentista).toBe("Daniel");
    expect(r?.validadeDias).toBe(30);
    expect(r?.itens).toContain("3 Lona - Placas Metalon");
  });

  it("extrai orçamento real de Cartão de Visita", () => {
    const texto = `
Brasília, 16/11/2026
À Louise Rocha
Fone : (61)99197-2832 Cel/Fax : (61)99197-2832
Apresentamos a seguir, nossa proposta comercial referente aos itens solicitados.
Item(ns) solicitado(s) do orçamento : 000994.
01) 900 Cartão de Visita - 5 Modelos
9x5cm, 4x4 cores em Papel VG Branco 300g. (5 modelos)
Refilado.
Total: R$ 440,00 Unit: 0,48888889 Pgto: À vista Entrega 2 dias úteis, após aprovação da arte.
Total dos itens : R$ 440,00
Orçamentista : Daniel
-Validade da proposta : 30 dias
Forma de pagamento: dinheiro ou pix
Condição de pagamento: 50% de entrada e 50% na retirada.
    `;

    const dataBase = new Date("2026-11-16T12:00:00Z");
    const r = extrairOrcamentoGrafico(texto, dataBase);

    expect(r).not.toBeNull();
    expect(r?.numero).toBe("000994");
    expect(r?.cliente).toBe("Louise Rocha");
    expect(r?.valorCents).toBe(44000);
    expect(r?.valorFormatado).toBe("R$ 440,00");
    expect(r?.prazoDiasUteis).toBe(2);
    expect(r?.prazoTexto).toBe("2 dias úteis, após aprovação da arte");
    expect(r?.dataEstimadaIso).toBe("2026-11-18");
    expect(r?.condicaoPagamento).toBe("50% de entrada e 50% na retirada");
    expect(r?.itens).toContain("900 Cartão de Visita - 5 Modelos");
  });

  it("retorna null para textos normais de conversa sem orçamento", () => {
    expect(extrairOrcamentoGrafico("Oi tudo bem? Bom dia!")).toBeNull();
  });
});
