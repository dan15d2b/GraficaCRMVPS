export interface LeadFinanceiro {
  id: string;
  title: string;
  value_cents: number | null;
  currency?: string;
  stage_id: string;
  stage_name?: string;
  stage_slug?: string;
  is_won?: boolean;
  is_lost?: boolean;
  is_producao?: boolean;
  is_proposta?: boolean;
  status: string; // 'open' | 'won' | 'lost'
  expected_close_date?: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface MesComparativo {
  chave: string;
  rotulo: string;
  anoMes: string;
  faturadoCents: number;
  producaoCents: number;
  metaCents: number;
}

export interface DiaRitmo {
  dia: number;
  diaFormatado: string;
  acumuladoCents: number;
  projecaoCents: number;
}

export interface CategoriaMaterial {
  nome: string;
  totalCents: number;
  percentual: number;
  quantidade: number;
}

export interface MetricasFinanceirasResumo {
  faturamentoMesAtualCents: number;
  faturamentoMesAnteriorCents: number;
  variacaoMoMPercent: number;
  
  emProducaoCents: number;
  emProducaoCount: number;
  
  propostasAbertasCents: number;
  propostasAbertasCount: number;
  
  ticketMedioCents: number;
  pedidosFechadosMesAtualCount: number;
  
  projecaoProximoMesCents: number;
  projecaoConservadoraCents: number;
  projecaoOtimistaCents: number;
  
  comparativoMensal: MesComparativo[];
  ritmoDiario: DiaRitmo[];
  categoriasMaterial: CategoriaMaterial[];
  maioresPedidos: LeadFinanceiro[];
}

const NOMES_MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

/**
 * Classifica a categoria do produto com base no título e detalhes do orçamento
 */
export function classificarMaterial(texto: string): string {
  const t = texto.toLowerCase();

  if (t.includes("lona") || t.includes("banner") || t.includes("faixa") || t.includes("backdrop") || t.includes("placa")) {
    return "Lonas & Banners";
  }
  if (t.includes("panfleto") || t.includes("folheto") || t.includes("folder") || t.includes("flyer") || t.includes("santinho")) {
    return "Panfletos & Folhetos";
  }
  if (t.includes("adesivo") || t.includes("vinil") || t.includes("rotulo") || t.includes("rótulo") || t.includes("etiqueta")) {
    return "Adesivos & Rótulos";
  }
  if (t.includes("cartão") || t.includes("cartao") || t.includes("visita") || t.includes("fidelidade")) {
    return "Cartões de Visita";
  }
  if (t.includes("revista") || t.includes("caderno") || t.includes("catálogo") || t.includes("catalogo") || t.includes("livro") || t.includes("apostila")) {
    return "Revistas & Cadernos";
  }
  if (t.includes("bloco") || t.includes("receituário") || t.includes("receituario") || t.includes("talão") || t.includes("talao") || t.includes("comanda")) {
    return "Blocos & Comandas";
  }

  return "Outros Materiais";
}

function extrairDataIso(dataStr?: string | null): string | null {
  if (!dataStr) return null;
  return dataStr.split("T")[0] ?? null;
}

/**
 * Calcula todas as métricas consolidadas da dashboard financeira
 */
export function calcularMetricasFinanceiras(
  leads: LeadFinanceiro[],
  dataReferencia: Date = new Date()
): MetricasFinanceirasResumo {
  const anoAtual = dataReferencia.getFullYear();
  const mesAtualNum = dataReferencia.getMonth(); // 0 a 11
  const diaAtual = dataReferencia.getDate();
  const totalDiasNoMes = new Date(anoAtual, mesAtualNum + 1, 0).getDate();

  const mesAtualStr = `${anoAtual}-${String(mesAtualNum + 1).padStart(2, "0")}`;
  
  const dataMesAnt = new Date(anoAtual, mesAtualNum - 1, 1);
  const anoMesAnt = dataMesAnt.getFullYear();
  const mesAntNum = dataMesAnt.getMonth();
  const mesAnteriorStr = `${anoMesAnt}-${String(mesAntNum + 1).padStart(2, "0")}`;

  let faturamentoMesAtualCents = 0;
  let pedidosFechadosMesAtualCount = 0;
  let faturamentoMesAnteriorCents = 0;

  let emProducaoCents = 0;
  let emProducaoCount = 0;

  let propostasAbertasCents = 0;
  let propostasAbertasCount = 0;

  // Mapa para agregação por categoria
  const categoriasMap = new Map<string, { totalCents: number; count: number }>();

  // Mapa diário do mês atual
  const acumuladoPorDia = new Map<number, number>();
  for (let d = 1; d <= totalDiasNoMes; d++) {
    acumuladoPorDia.set(d, 0);
  }

  // Prepara estrutura para os últimos 6 meses
  const ultimos6Meses: MesComparativo[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anoAtual, mesAtualNum - i, 1);
    const a = d.getFullYear();
    const m = d.getMonth();
    const chave = `${a}-${String(m + 1).padStart(2, "0")}`;
    const rotulo = `${NOMES_MESES[m]}/${String(a).slice(2)}`;
    ultimos6Meses.push({
      chave,
      rotulo,
      anoMes: chave,
      faturadoCents: 0,
      producaoCents: 0,
      metaCents: 0,
    });
  }
  const mesesMap = new Map(ultimos6Meses.map((m) => [m.anoMes, m]));

  for (const lead of leads) {
    const val = lead.value_cents ?? 0;
    if (val <= 0) continue;

    const dataEfetiva = extrairDataIso(lead.stage_changed_at || lead.updated_at || lead.created_at);
    const anoMes = dataEfetiva ? dataEfetiva.slice(0, 7) : null;

    const ehGanho = lead.is_won || lead.status === "won" || lead.stage_slug === "concluido";
    const ehProducao = lead.is_producao || 
      (lead.stage_name && /produção|retirada|instalação/i.test(lead.stage_name)) ||
      (lead.stage_slug && /producao|retirada|instalacao/i.test(lead.stage_slug));
    const ehProposta = lead.is_proposta ||
      (lead.stage_name && /proposta|orçamento|briefing|atendimento/i.test(lead.stage_name)) ||
      (lead.stage_slug && /proposta|orcamento|briefing|atendimento/i.test(lead.stage_slug));

    // 1. Faturamento Concluído (Won)
    if (ehGanho) {
      if (anoMes === mesAtualStr) {
        faturamentoMesAtualCents += val;
        pedidosFechadosMesAtualCount += 1;

        if (dataEfetiva) {
          const dia = parseInt(dataEfetiva.slice(8, 10), 10);
          if (dia >= 1 && dia <= totalDiasNoMes) {
            acumuladoPorDia.set(dia, (acumuladoPorDia.get(dia) ?? 0) + val);
          }
        }
      } else if (anoMes === mesAnteriorStr) {
        faturamentoMesAnteriorCents += val;
      }

      if (anoMes && mesesMap.has(anoMes)) {
        const item = mesesMap.get(anoMes)!;
        item.faturadoCents += val;
      }

      // Categoria de material
      const cat = classificarMaterial(lead.title);
      const catAtual = categoriasMap.get(cat) ?? { totalCents: 0, count: 0 };
      catAtual.totalCents += val;
      catAtual.count += 1;
      categoriasMap.set(cat, catAtual);
    }
    // 2. Em Produção (Receita garantida a faturar)
    else if (ehProducao && lead.status !== "lost") {
      emProducaoCents += val;
      emProducaoCount += 1;

      if (anoMes && mesesMap.has(anoMes)) {
        const item = mesesMap.get(anoMes)!;
        item.producaoCents += val;
      } else if (mesesMap.has(mesAtualStr)) {
        const item = mesesMap.get(mesAtualStr)!;
        item.producaoCents += val;
      }

      const cat = classificarMaterial(lead.title);
      const catAtual = categoriasMap.get(cat) ?? { totalCents: 0, count: 0 };
      catAtual.totalCents += val;
      catAtual.count += 1;
      categoriasMap.set(cat, catAtual);
    }
    // 3. Propostas Abertas
    else if (ehProposta && lead.status === "open") {
      propostasAbertasCents += val;
      propostasAbertasCount += 1;
    }
  }

  // Variação MoM (Month over Month)
  let variacaoMoMPercent = 0;
  if (faturamentoMesAnteriorCents > 0) {
    variacaoMoMPercent = Math.round(
      ((faturamentoMesAtualCents - faturamentoMesAnteriorCents) / faturamentoMesAnteriorCents) * 100
    );
  } else if (faturamentoMesAtualCents > 0) {
    variacaoMoMPercent = 100;
  }

  // Ticket Médio
  const ticketMedioCents = pedidosFechadosMesAtualCount > 0
    ? Math.round(faturamentoMesAtualCents / pedidosFechadosMesAtualCount)
    : (emProducaoCount > 0 ? Math.round(emProducaoCents / emProducaoCount) : 0);

  // Projeções para o próximo mês
  // Run rate atual: faturamento diário médio no mês atual
  const diasCorridos = Math.max(1, diaAtual);
  const mediaDiariaAtual = (faturamentoMesAtualCents + emProducaoCents) / diasCorridos;
  const runRateMesCheio = mediaDiariaAtual * totalDiasNoMes;

  // Cenário Conservador: 80% do run rate atual (base fixa recorrente)
  const projecaoConservadoraCents = Math.round(runRateMesCheio * 0.8);
  // Cenário Realista: 100% do run rate atual + 35% das propostas em aberto
  const projecaoProximoMesCents = Math.round(runRateMesCheio + (propostasAbertasCents * 0.35));
  // Cenário Otimista: 120% do run rate + 65% das propostas em aberto
  const projecaoOtimistaCents = Math.round((runRateMesCheio * 1.2) + (propostasAbertasCents * 0.65));

  // Metas estimadas para o comparativo mensal (média móvel simples)
  for (const m of ultimos6Meses) {
    m.metaCents = Math.round((m.faturadoCents + m.producaoCents) * 1.15) || 500000;
  }

  // Monta curva de ritmo diário acumulado
  const ritmoDiario: DiaRitmo[] = [];
  let somaAcumulada = 0;
  const metaDiariaPasso = (faturamentoMesAtualCents + emProducaoCents) / totalDiasNoMes;

  for (let d = 1; d <= totalDiasNoMes; d++) {
    const valorDia = acumuladoPorDia.get(d) ?? 0;
    if (d <= diaAtual) {
      somaAcumulada += valorDia;
    }
    ritmoDiario.push({
      dia: d,
      diaFormatado: `${String(d).padStart(2, "0")}/${String(mesAtualNum + 1).padStart(2, "0")}`,
      acumuladoCents: d <= diaAtual ? somaAcumulada : Math.round(somaAcumulada + (d - diaAtual) * mediaDiariaAtual),
      projecaoCents: Math.round(d * metaDiariaPasso),
    });
  }

  // Categorias de Material
  const totalGeralCategorias = Array.from(categoriasMap.values()).reduce((acc, c) => acc + c.totalCents, 0) || 1;
  const categoriasMaterial: CategoriaMaterial[] = Array.from(categoriasMap.entries())
    .map(([nome, dados]) => ({
      nome,
      totalCents: dados.totalCents,
      quantidade: dados.count,
      percentual: Math.round((dados.totalCents / totalGeralCategorias) * 100),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  // Maiores Pedidos (ordenados por valor decrescente)
  const maioresPedidos = [...leads]
    .filter((l) => (l.value_cents ?? 0) > 0)
    .sort((a, b) => (b.value_cents ?? 0) - (a.value_cents ?? 0))
    .slice(0, 10);

  return {
    faturamentoMesAtualCents,
    faturamentoMesAnteriorCents,
    variacaoMoMPercent,
    emProducaoCents,
    emProducaoCount,
    propostasAbertasCents,
    propostasAbertasCount,
    ticketMedioCents,
    pedidosFechadosMesAtualCount,
    projecaoProximoMesCents,
    projecaoConservadoraCents,
    projecaoOtimistaCents,
    comparativoMensal: ultimos6Meses,
    ritmoDiario,
    categoriasMaterial,
    maioresPedidos,
  };
}
