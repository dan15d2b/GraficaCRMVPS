import { describe, expect, it } from "vitest";
import { calcularPrazo, classificarEtapa } from "./prazo";

describe("calcularPrazo (Semáforo de Produção)", () => {
  const baseHoje = new Date(2026, 10, 15); // 15 de novembro de 2026

  it("identifica prazo atrasado quando data alvo é no passado", () => {
    const res = calcularPrazo("2026-11-13", baseHoje);
    expect(res.prazoStatus).toBe("atrasado");
    expect(res.diasRestantes).toBe(-2);
    expect(res.prazoFormatado).toBe("13/11/2026");
  });

  it("identifica entrega hoje quando data alvo é hoje", () => {
    const res = calcularPrazo("2026-11-15", baseHoje);
    expect(res.prazoStatus).toBe("hoje");
    expect(res.diasRestantes).toBe(0);
    expect(res.prazoFormatado).toBe("15/11/2026");
  });

  it("identifica entrega amanhã quando data alvo é 1 dia a frente", () => {
    const res = calcularPrazo("2026-11-16", baseHoje);
    expect(res.prazoStatus).toBe("amanha");
    expect(res.diasRestantes).toBe(1);
    expect(res.prazoFormatado).toBe("16/11/2026");
  });

  it("identifica no prazo quando data alvo é em 3 dias", () => {
    const res = calcularPrazo("2026-11-18", baseHoje);
    expect(res.prazoStatus).toBe("no_prazo");
    expect(res.diasRestantes).toBe(3);
    expect(res.prazoFormatado).toBe("18/11/2026");
  });

  it("trata ausência de data como sem_prazo", () => {
    const res = calcularPrazo(null, baseHoje);
    expect(res.prazoStatus).toBe("sem_prazo");
    expect(res.diasRestantes).toBeNull();
  });
});

describe("classificarEtapa", () => {
  it("classifica etapa de produção por nome", () => {
    expect(classificarEtapa({ name: "Em produção" })).toBe("producao");
    expect(classificarEtapa({ name: "Produção Gráfica" })).toBe("producao");
  });

  it("classifica etapa de retirada por nome", () => {
    expect(classificarEtapa({ name: "Pronto para retirada" })).toBe("retirada");
    expect(classificarEtapa({ name: "Balcão de Retirada" })).toBe("retirada");
  });

  it("classifica etapa de instalação por nome", () => {
    expect(classificarEtapa({ name: "Pronto para instalação/entrega" })).toBe("instalacao");
    expect(classificarEtapa({ name: "Equipe de Instalação" })).toBe("instalacao");
    expect(classificarEtapa({ name: "Entrega Externa" })).toBe("instalacao");
  });

  it("classifica outras etapas como outro", () => {
    expect(classificarEtapa({ name: "Lead" })).toBe("outro");
    expect(classificarEtapa({ name: "Briefing" })).toBe("outro");
    expect(classificarEtapa({ name: "Fazer orçamento" })).toBe("outro");
  });
});
