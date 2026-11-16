import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_DE_AGENDAMENTO,
  LOCAIS_DE_AGENDAMENTO,
} from "../tipos";
import { MODELOS_DE_AGENDAMENTO_GRAFICA } from "./grafica";

describe("MODELOS_DE_AGENDAMENTO_GRAFICA", () => {
  it("contém os 4 serviços essenciais de comunicação visual", () => {
    expect(MODELOS_DE_AGENDAMENTO_GRAFICA.length).toBe(4);
    const slugs = MODELOS_DE_AGENDAMENTO_GRAFICA.map((m) => m.slug);
    expect(slugs).toContain("medicao-tecnica");
    expect(slugs).toContain("instalacao-externa");
    expect(slugs).toContain("entrega-programada");
    expect(slugs).toContain("reuniao-amostras");
  });

  it("todos os modelos possuem slugs únicos", () => {
    const slugs = MODELOS_DE_AGENDAMENTO_GRAFICA.map((m) => m.slug);
    const conjunto = new Set(slugs);
    expect(conjunto.size).toBe(slugs.length);
  });

  it("todas as categorias são válidas e conhecidas no banco", () => {
    for (const m of MODELOS_DE_AGENDAMENTO_GRAFICA) {
      expect(CATEGORIAS_DE_AGENDAMENTO).toContain(m.category);
    }
  });

  it("todos os locais de atendimento são válidos", () => {
    for (const m of MODELOS_DE_AGENDAMENTO_GRAFICA) {
      expect(LOCAIS_DE_AGENDAMENTO).toContain(m.location_kind);
    }
  });

  it("durações e janelas respeitam limites positivos", () => {
    for (const m of MODELOS_DE_AGENDAMENTO_GRAFICA) {
      expect(m.duration_minutes).toBeGreaterThan(0);
      expect(m.buffer_before_minutes).toBeGreaterThanOrEqual(0);
      expect(m.buffer_after_minutes).toBeGreaterThanOrEqual(0);
      expect(m.booking_window_days).toBeGreaterThan(0);
    }
  });

  it("todos os lembretes possuem corpos informativos com placeholders", () => {
    for (const m of MODELOS_DE_AGENDAMENTO_GRAFICA) {
      if (m.reminder_enabled) {
        expect(m.reminder_body.length).toBeGreaterThan(20);
        expect(m.reminder_body).toContain("{nome}");
        expect(m.reminder_body).toContain("{horario}");
      }
    }
  });
});
