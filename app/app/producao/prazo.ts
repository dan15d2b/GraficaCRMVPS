import type { PrazoStatus } from "./types";

/**
 * Classifica a etapa do funil em relação ao fluxo operacional de comunicação visual.
 */
export function classificarEtapa(stage: {
  name: string;
  slug?: string | null;
  is_won?: boolean;
}): "producao" | "retirada" | "instalacao" | "concluido" | "outro" {
  const nome = (stage.name || "").toLowerCase();
  const slug = (stage.slug || "").toLowerCase();

  // 1. Etapas operacionais de produção têm prioridade sobre flags de fechamento (is_won)
  if (
    nome.includes("produç") ||
    nome.includes("producao") ||
    slug.includes("producao")
  ) {
    return "producao";
  }

  // 2. Etapa de retirada no balcão
  if (nome.includes("retirada") || slug.includes("retirada")) {
    return "retirada";
  }

  // 3. Etapa de instalação externa ou entrega em rota
  if (
    nome.includes("instala") ||
    slug.includes("instala") ||
    nome.includes("entrega") ||
    slug.includes("entrega")
  ) {
    return "instalacao";
  }

  // 4. Etapa final de conclusão / finalização / entregue ou marcada como ganho
  if (
    nome.includes("conclu") ||
    slug.includes("conclu") ||
    nome.includes("finaliz") ||
    slug.includes("finaliz") ||
    nome.includes("entregue") ||
    slug.includes("entregue") ||
    stage.is_won
  ) {
    return "concluido";
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
