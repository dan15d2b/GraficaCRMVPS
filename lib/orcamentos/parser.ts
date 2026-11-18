import { generateObject } from "ai";
import { z } from "zod";
import { resolveLanguageModel, DEFAULT_CLASSIFIER_MODEL } from "@/lib/ai/gateway";
import { logger } from "@/lib/logger";
import { calcularDataEntregaDiasUteis } from "./dias-uteis";
import type { ItemOrcamento, OrcamentoExtraido } from "./tipos";
import { formatarDinheiro, gerarMensagemDoOrcamento } from "./formatador";

export { formatarDinheiro, gerarMensagemDoOrcamento };

const OrcamentoAiSchema = z.object({
  numero_orcamento: z.string().nullable().optional(),
  cliente_nome: z.string().nullable().optional(),
  itens: z.array(
    z.object({
      descricao: z.string(),
      quantidade: z.number().default(1),
      medidas: z.string().nullable().optional(),
      acabamento: z.string().nullable().optional(),
      valor_unitario: z.number().default(0),
      valor_total: z.number().default(0),
    }),
  ),
  valor_total_geral: z.number().default(0),
  forma_pagamento: z.string().nullable().optional(),
  prazo_dias_uteis: z.number().int().min(1).max(180).default(5),
  observacoes: z.string().nullable().optional(),
});

/**
 * Parser heurístico baseado em regex caso a IA esteja offline ou sem chaves.
 */
function parsearHeuristico(texto: string): OrcamentoExtraido {
  // 1. Procurar valor total
  let valorTotalCents = 0;
  const matchTotal = texto.match(/(?:total|valor\s*total|total\s*geral)[^\d\n\r]*R?\$?\s*([\d.]+,\d{2}|\d+)/i);
  if (matchTotal && matchTotal[1]) {
    const numLimpo = matchTotal[1].replace(/\./g, "").replace(",", ".");
    const v = parseFloat(numLimpo);
    if (!isNaN(v) && v > 0) valorTotalCents = Math.round(v * 100);
  }

  // 2. Procurar prazo em dias úteis
  let prazoDiasUteis = 5;
  const matchPrazo = texto.match(/(\d+)\s*(?:dias\s*úteis|dias\s*uteis|dias\s*de\s*produção|dias)/i);
  if (matchPrazo && matchPrazo[1]) {
    const p = parseInt(matchPrazo[1], 10);
    if (!isNaN(p) && p > 0 && p <= 120) prazoDiasUteis = p;
  }

  // 3. Procurar número de orçamento
  let numeroOrcamento: string | undefined;
  const matchNumero = texto.match(/(?:orçamento|orcamento|pedido|o\.s\.|os)[^\d\n\r]*(?:n[ºo°]?\s*)?#?(\d+)/i);
  if (matchNumero && matchNumero[1]) {
    numeroOrcamento = matchNumero[1];
  }

  // 4. Procurar forma de pagamento
  let formaPagamento: string | undefined;
  const matchPagto = texto.match(/(?:pagamento|condições|condicao)[^\n:]*[:\s]+([^\n\r]+)/i);
  if (matchPagto && matchPagto[1]) {
    formaPagamento = matchPagto[1].trim();
  }

  // 5. Linhas de itens (procurar linhas com quantidades e valores)
  const itens: ItemOrcamento[] = [];
  const linhas = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);

  for (const linha of linhas) {
    const matchLinha = linha.match(/(?:^|\s)(\d+[\d.]*)\s*(?:x|un|unid|unidades|peças|m²)?\s+(.+?)(?:R?\$?\s*([\d.]+,\d{2}))?$/i);
    if (matchLinha && matchLinha[2]) {
      const qtd = parseInt(matchLinha[1]?.replace(/\./g, "") || "1", 10) || 1;
      const desc = matchLinha[2].trim();
      let valorItem = 0;
      if (matchLinha[3]) {
        const v = parseFloat(matchLinha[3].replace(/\./g, "").replace(",", "."));
        if (!isNaN(v)) valorItem = Math.round(v * 100);
      }
      if (desc.length > 3 && !desc.toLowerCase().startsWith("total")) {
        itens.push({
          descricao: desc,
          quantidade: qtd,
          valor_unitario_cents: qtd > 0 ? Math.round(valorItem / qtd) : valorItem,
          valor_total_cents: valorItem,
        });
      }
    }
  }

  if (itens.length === 0) {
    itens.push({
      descricao: "Serviços Gráficos / Produção",
      quantidade: 1,
      valor_unitario_cents: valorTotalCents,
      valor_total_cents: valorTotalCents,
    });
  }

  const entrega = calcularDataEntregaDiasUteis(new Date(), prazoDiasUteis);
  const mensagem = gerarMensagemDoOrcamento({
    numero_orcamento: numeroOrcamento,
    itens,
    valor_total_cents: valorTotalCents,
    forma_pagamento: formaPagamento,
    prazo_dias_uteis: prazoDiasUteis,
    data_estimada_entrega_formatada: entrega.formatadaCurta,
  });

  return {
    numero_orcamento: numeroOrcamento,
    itens,
    valor_total_cents: valorTotalCents,
    forma_pagamento: formaPagamento,
    prazo_dias_uteis: prazoDiasUteis,
    data_estimada_entrega: entrega.dataIso,
    data_estimada_entrega_formatada: entrega.formatadaExtenso,
    mensagem_sugerida: mensagem,
  };
}

/**
 * Analisa e extrai dados de um orçamento em texto (ou PDF convertido).
 * Tenta usar IA estruturada primeiro; se não houver modelo disponível, usa heurística.
 */
export async function parsearOrcamentoTexto(
  texto: string,
  opcoes?: { organizationId?: string; fuso?: string },
): Promise<OrcamentoExtraido> {
  const textoLimpo = texto.trim();
  if (!textoLimpo) {
    throw new Error("O texto do orçamento está vazio.");
  }

  const fuso = opcoes?.fuso || "America/Sao_Paulo";
  const model = resolveLanguageModel(DEFAULT_CLASSIFIER_MODEL);

  if (model) {
    try {
      const prompt = `Você é um especialista em orçamentos para gráficas rápidas, offset e comunicação visual (lonas, adesivos, banners, placas, cartões, panfletos, etc).
Analise com extrema atenção o texto do orçamento a seguir (gerado pelo sistema de gestão da gráfica) e extraia todos os dados estruturados:

--- TEXTO DO ORÇAMENTO ---
${textoLimpo.slice(0, 10000)}
--- FIM DO TEXTO ---

Regras de Extração:
1. 'numero_orcamento': O número do orçamento ou pedido (ex: "1048", "ORC-552").
2. 'cliente_nome': Nome do cliente ou empresa, se houver.
3. 'itens': Cada produto ou serviço listado:
   - 'descricao': Nome do produto/material (ex: "Lona 440g fosca", "Cartão de visita couché 300g").
   - 'quantidade': Quantidade de unidades (ex: 1000, 2).
   - 'medidas': Dimensões se houver (ex: "2,00 x 1,00m", "9x5cm").
   - 'acabamento': Acabamento especificado (ex: "Ilhós a cada 30cm", "Laminação fosca").
   - 'valor_unitario': Valor unitário em reais (ex: 15.50).
   - 'valor_total': Valor total daquele item em reais (ex: 31.00).
4. 'valor_total_geral': O valor total final do orçamento em reais (ex: 350.00).
5. 'forma_pagamento': Condição de pagamento encontrada (ex: "50% entrada + 50% na retirada", "À vista com 5%", "Cartão até 3x").
6. 'prazo_dias_uteis': Prazo de produção estritamente em DIAS ÚTEIS (número inteiro, ex: 5). Se o texto disser "5 dias úteis", use 5. Se não mencionar prazo, use 5 como padrão.
7. 'observacoes': Qualquer detalhe técnico importante.`;

      const { object } = await generateObject({
        model,
        schema: OrcamentoAiSchema,
        prompt,
      });

      const itensConvertidos: ItemOrcamento[] = (object.itens || []).map((it) => ({
        descricao: it.descricao,
        quantidade: Math.max(1, it.quantidade || 1),
        medidas: it.medidas || undefined,
        acabamento: it.acabamento || undefined,
        valor_unitario_cents: Math.round((it.valor_unitario || 0) * 100),
        valor_total_cents: Math.round((it.valor_total || (it.valor_unitario || 0) * (it.quantidade || 1)) * 100),
      }));

      let valorTotalCents = Math.round((object.valor_total_geral || 0) * 100);
      if (valorTotalCents === 0 && itensConvertidos.length > 0) {
        valorTotalCents = itensConvertidos.reduce((acc, it) => acc + it.valor_total_cents, 0);
      }

      const prazoDiasUteis = object.prazo_dias_uteis || 5;
      const entrega = calcularDataEntregaDiasUteis(new Date(), prazoDiasUteis, fuso);

      const mensagem = gerarMensagemDoOrcamento({
        numero_orcamento: object.numero_orcamento || undefined,
        itens: itensConvertidos,
        valor_total_cents: valorTotalCents,
        forma_pagamento: object.forma_pagamento || undefined,
        prazo_dias_uteis: prazoDiasUteis,
        data_estimada_entrega_formatada: entrega.formatadaCurta,
      });

      return {
        numero_orcamento: object.numero_orcamento || undefined,
        cliente_nome: object.cliente_nome || undefined,
        itens: itensConvertidos,
        valor_total_cents: valorTotalCents,
        forma_pagamento: object.forma_pagamento || undefined,
        prazo_dias_uteis: prazoDiasUteis,
        data_estimada_entrega: entrega.dataIso,
        data_estimada_entrega_formatada: entrega.formatadaExtenso,
        observacoes: object.observacoes || undefined,
        mensagem_sugerida: mensagem,
      };
    } catch (aiErr) {
      logger.warn("[orcamentos.parser] IA falhou, usando extrator heurístico de fallback", {
        error: aiErr,
      });
    }
  }

  // Fallback heurístico
  return parsearHeuristico(textoLimpo);
}
