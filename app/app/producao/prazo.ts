import type { PrazoStatus } from "./types";

/**
 * Classifica a etapa do funil em relação ao fluxo operacional de comunicação visual.
 */
export function classificarEtapa(stage: {
  name: string;
  slug?: string | null;
  is_won?: boolean;
}): "producao" | "retirada" | "instalacao" | "outro" {
  const nome = (stage.name || "").toLowerCase();
  const slug = (stage.slug || "").toLowerCase();

  if (nome.includes("retirada") || slug.includes("retirada")) {
    return "retirada";
  }
  if (
    nome.includes("instala") ||
    slug.includes("instala") ||
    nome.includes("entrega") ||
    slug.includes("entrega")
  ) {
    return "instalacao";
  }
  if (
    nome.includes("produç") ||
    nome.includes("producao") ||
    slug.includes("producao") ||
    stage.is_won
  ) {
    return "producao";
  }
  return "outro";
}

/**
 * Calcula o semáforo de prazo a partir de expected_close_date (YYYY-MM-DD).
 */
export function calcularPrazo(
  expected_close_date: string | null,
  agora: Date = new Date(),
): {
  prazoStatus: PrazoStatus;
  diasRestantes: number | null;
  prazoFormatado: string;
} {
  if (!expected_close_date) {
    return {
      prazoStatus: "sem_prazo",
      diasRestantes: null,
      prazoFormatado: "Sem prazo definido",
    };
  }

  // Tratamento de YYYY-MM-DD ou ISO string
  const parteData = expected_close_date.includes("T")
    ? expected_close_date.split("T")[0]!
    : expected_close_date;

  const partes = parteData.split("-").map(Number);
  const ano = partes[0];
  const mes = partes[1];
  const dia = partes[2];

  if (!ano || !mes || !dia) {
    return {
      prazoStatus: "sem_prazo",
      diasRestantes: null,
      prazoFormatado: expected_close_date,
    };
  }

  const dataAlvo = new Date(ano, mes - 1, dia);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  const diffMs = dataAlvo.getTime() - hoje.getTime();
  const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const formatado = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;

  if (diasRestantes < 0) {
    return {
      prazoStatus: "atrasado",
      diasRestantes,
      prazoFormatado: formatado,
    };
  }
  if (diasRestantes === 0) {
    return {
      prazoStatus: "hoje",
      diasRestantes: 0,
      prazoFormatado: formatado,
    };
  }
  if (diasRestantes === 1) {
    return {
      prazoStatus: "amanha",
      diasRestantes: 1,
      prazoFormatado: formatado,
    };
  }
  return {
    prazoStatus: "no_prazo",
    diasRestantes,
    prazoFormatado: formatado,
  };
}
