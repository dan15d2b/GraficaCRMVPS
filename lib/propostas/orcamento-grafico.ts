import type { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Parser e sincronizador de propostas/orçamentos gráficos.
 *
 * Gráficas rápidas e birôs de comunicação visual frequentemente geram propostas
 * comerciais em PDF (via Calcme, Ecalc, Sisplan ou sistemas próprios) e as enviam
 * via WhatsApp.
 *
 * Este módulo extrai de forma determinística:
 * - Número do orçamento
 * - Itens e acabamentos
 * - Valor total (em centavos e formatado)
 * - Prazo de entrega (dias úteis e texto)
 * - Data de entrega estimada (calculada em dias úteis)
 * - Condição e forma de pagamento
 * - Orçamentista
 */

export interface OrcamentoGraficoExtraido {
  numero: string | null;
  cliente: string | null;
  telefone: string | null;
  itens: string[];
  itensResumo: string | null;
  valorCents: number | null;
  valorFormatado: string | null;
  prazoTexto: string | null;
  prazoDiasUteis: number | null;
  dataEstimadaIso: string | null;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  orcamentista: string | null;
  validadeDias: number | null;
}

/**
 * Calcula a data estimada somando N dias úteis a partir de uma data base.
 */
export function somarDiasUteis(dataBase: Date, diasUteis: number): Date {
  const data = new Date(dataBase);
  let adicionados = 0;
  while (adicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay();
    // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      adicionados++;
    }
  }
  return data;
}

/**
 * Extrai dados estruturados de um texto de orçamento gráfico.
 */
export function extrairOrcamentoGrafico(texto: string, dataReferencia: Date = new Date()): OrcamentoGraficoExtraido | null {
  if (!texto || typeof texto !== "string") return null;

  // Reconhece se o texto tem traços mínimos de orçamento gráfico
  const ehOrcamento =
    /orçamento|proposta comercial|total:\s*r\$|entrega\s+\d+\s*dias/i.test(texto);

  if (!ehOrcamento) return null;

  // 1. Número do orçamento
  const matchNumero =
    texto.match(/orçamento\s*:\s*([0-9]+)/i) ||
    texto.match(/orçamento\s*(?:n[ºo°]?|número)\s*:?\s*([0-9]+)/i) ||
    texto.match(/proposta\s*(?:n[ºo°]?|número)?\s*:?\s*([0-9]+)/i);
  const numero = matchNumero?.[1]?.trim() ?? null;

  // 2. Cliente
  const matchCliente =
    texto.match(/À\s+([^\n\r]+)/) ||
    texto.match(/Cliente\s*:\s*([^\n\r]+)/i);
  const cliente = matchCliente?.[1]?.trim() ?? null;

  // 3. Telefone
  const matchTelefone = texto.match(/Fone\s*:\s*([^\n\r]+)/i);
  const telefone = matchTelefone?.[1]?.trim() ?? null;

  // 4. Itens do orçamento
  // Padrão comum: "01) 3 Lona - Placas Metalon" ou "1. 900 Cartão de Visita"
  const itemRegex = /(?:^|\n)\s*(?:\d{1,2}\)|\d{1,2}\.)\s*([^\n\r]+)/g;
  const itens: string[] = [];
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(texto)) !== null) {
    const itemLimpo = itemMatch[1]?.trim();
    if (itemLimpo && !/total|subtotal|orçamentista/i.test(itemLimpo)) {
      itens.push(itemLimpo);
    }
  }

  const itensResumo = itens.length > 0 ? itens.join(" | ") : null;

  // 5. Valor Total
  // "Total: R$ 1.560,00" ou "Total dos itens : R$ 440,00"
  const matchValor =
    texto.match(/Total\s*(?:dos\s*itens)?\s*:\s*R\$\s*([\d\.,]+)/i) ||
    texto.match(/Valor\s*Total\s*:\s*R\$\s*([\d\.,]+)/i) ||
    texto.match(/Total\s*:\s*([\d\.,]+)/i);

  let valorCents: number | null = null;
  let valorFormatado: string | null = null;

  if (matchValor?.[1]) {
    const limpo = matchValor[1].trim();
    // Converte formato BR: 1.560,00 -> 1560.00
    const normalizado = limpo.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalizado);
    if (!isNaN(num) && num > 0) {
      valorCents = Math.round(num * 100);
      valorFormatado = `R$ ${limpo}`;
    }
  }

  // 6. Prazo de entrega
  // "Entrega 3 dias úteis, após aprovação da arte" ou "Entrega: 5 dias úteis"
  const matchPrazo =
    texto.match(/Entrega\s*:?\s*([^,\.\n\r]+(?:,\s*[^,\.\n\r]+)?)/i) ||
    texto.match(/Prazo\s*(?:de\s*entrega)?\s*:?\s*([^,\.\n\r]+)/i);

  const prazoTexto = matchPrazo?.[1]?.trim() ?? null;

  let prazoDiasUteis: number | null = null;
  let dataEstimadaIso: string | null = null;

  const matchDias = prazoTexto?.match(/(\d+)\s*dias?\s*úteis?/i) || texto.match(/(\d+)\s*dias?\s*úteis?/i);
  if (matchDias?.[1]) {
    const dias = parseInt(matchDias[1], 10);
    if (!isNaN(dias) && dias > 0) {
      prazoDiasUteis = dias;
      const dataEst = somarDiasUteis(dataReferencia, dias);
      dataEstimadaIso = dataEst.toISOString().split("T")[0]!;
    }
  }

  // 7. Condição de pagamento
  const matchCondicao = texto.match(/Condição\s*de\s*pagamento\s*:\s*([^\n\r]+)/i);
  const condicaoPagamento = matchCondicao?.[1]?.trim().replace(/[.,;]+$/, "") ?? null;

  // 8. Forma de pagamento
  const matchForma = texto.match(/Forma\s*de\s*pagamento\s*:\s*([^\n\r]+)/i);
  const formaPagamento = matchForma?.[1]?.trim().replace(/[.,;]+$/, "") ?? null;

  // 9. Orçamentista
  const matchOrcamentista = texto.match(/Orçamentista\s*:\s*([^\n\r\-]+)/i);
  const orcamentista = matchOrcamentista?.[1]?.trim().replace(/[.,;]+$/, "") ?? null;

  // 10. Validade da proposta
  const matchValidade = texto.match(/Validade\s*da\s*proposta\s*:\s*(\d+)\s*dias/i);
  const validadeDias = matchValidade?.[1] ? parseInt(matchValidade[1], 10) : null;

  return {
    numero,
    cliente,
    telefone,
    itens,
    itensResumo,
    valorCents,
    valorFormatado,
    prazoTexto,
    prazoDiasUteis,
    dataEstimadaIso,
    condicaoPagamento,
    formaPagamento,
    orcamentista,
    validadeDias,
  };
}

/**
 * Sincroniza os dados de um orçamento gráfico extraído com os cards em `crm_leads`.
 *
 * Preenche automaticamente:
 * - `value_cents` se estiver vazio
 * - `expected_close_date` se estiver vazio
 * - `custom_fields` com detalhes do orçamento
 */
export async function sincronizarOrcamentoComLead(
  admin: ReturnType<typeof createAdminClient>,
  dados: {
    organizationId: string;
    conversationId: string;
    texto: string;
    dataMensagem?: Date;
  },
): Promise<{ ok: boolean; leadId?: string; atualizado?: boolean; orcamento?: OrcamentoGraficoExtraido }> {
  try {
    const orcamento = extrairOrcamentoGrafico(dados.texto, dados.dataMensagem ?? new Date());
    if (!orcamento || (!orcamento.valorCents && !orcamento.numero)) {
      return { ok: false };
    }

    // 1. Resolve o contato da conversa
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("id", dados.conversationId)
      .eq("organization_id", dados.organizationId)
      .maybeSingle();

    if (convErr || !conv?.contact_id) {
      return { ok: false };
    }

    const contactId = conv.contact_id;

    // 2. Busca lead aberto/em andamento deste contato
    const { data: leads, error: leadsErr } = await admin
      .from("crm_leads")
      .select("id, title, value_cents, expected_close_date, custom_fields, stage_id, status")
      .eq("contact_id", contactId)
      .eq("organization_id", dados.organizationId)
      .neq("status", "lost")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (leadsErr) {
      logger.warn("[orcamento-grafico] erro ao buscar leads do contato", { error: leadsErr.message });
      return { ok: false };
    }

    if (leads && leads.length > 0) {
      const lead = leads[0]!;
      const customFields = (lead.custom_fields as Record<string, unknown>) ?? {};
      const novosCustomFields = {
        ...customFields,
        ...(orcamento.numero ? { numero_orcamento: orcamento.numero } : {}),
        ...(orcamento.itensResumo ? { itens: orcamento.itensResumo } : {}),
        ...(orcamento.prazoTexto ? { prazo_entrega: orcamento.prazoTexto } : {}),
        ...(orcamento.condicaoPagamento ? { condicao_pagamento: orcamento.condicaoPagamento } : {}),
        ...(orcamento.formaPagamento ? { forma_pagamento: orcamento.formaPagamento } : {}),
        ...(orcamento.orcamentista ? { orcamentista: orcamento.orcamentista } : {}),
      };

      const updates: Record<string, unknown> = {
        custom_fields: novosCustomFields,
      };

      if ((!lead.value_cents || lead.value_cents === 0) && orcamento.valorCents) {
        updates.value_cents = orcamento.valorCents;
      }

      if (!lead.expected_close_date && orcamento.dataEstimadaIso) {
        updates.expected_close_date = orcamento.dataEstimadaIso;
      }

      if (orcamento.itensResumo && (lead.title.startsWith("+55") || lead.title.length < 5)) {
        updates.title = `${orcamento.numero ? `#${orcamento.numero} ` : ""}${orcamento.itensResumo.slice(0, 50)}`;
      }

      const { error: updErr } = await admin
        .from("crm_leads")
        .update(updates)
        .eq("id", lead.id)
        .eq("organization_id", dados.organizationId);

      if (updErr) {
        logger.warn("[orcamento-grafico] falha ao atualizar lead com orcamento", { error: updErr.message });
        return { ok: false };
      }

      return { ok: true, leadId: lead.id, atualizado: true, orcamento };
    }

    // 3. Se não existe lead aberto, cria um no funil padrão
    const { data: pipeline } = await admin
      .from("crm_pipelines")
      .select("id")
      .eq("organization_id", dados.organizationId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pipeline) {
      const { data: stage } = await admin
        .from("crm_stages")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (stage) {
        const { data: novoLead, error: insErr } = await admin
          .from("crm_leads")
          .insert({
            organization_id: dados.organizationId,
            contact_id: contactId,
            pipeline_id: pipeline.id,
            stage_id: stage.id,
            title: `${orcamento.numero ? `Orçamento #${orcamento.numero} - ` : ""}${orcamento.itensResumo?.slice(0, 50) ?? "Proposta Comercial"}`,
            value_cents: orcamento.valorCents,
            expected_close_date: orcamento.dataEstimadaIso,
            custom_fields: {
              ...(orcamento.numero ? { numero_orcamento: orcamento.numero } : {}),
              ...(orcamento.itensResumo ? { itens: orcamento.itensResumo } : {}),
              ...(orcamento.prazoTexto ? { prazo_entrega: orcamento.prazoTexto } : {}),
              ...(orcamento.condicaoPagamento ? { condicao_pagamento: orcamento.condicaoPagamento } : {}),
              ...(orcamento.formaPagamento ? { forma_pagamento: orcamento.formaPagamento } : {}),
              ...(orcamento.orcamentista ? { orcamentista: orcamento.orcamentista } : {}),
            },
            status: "open",
          })
          .select("id")
          .maybeSingle();

        if (insErr) {
          logger.warn("[orcamento-grafico] falha ao criar lead com orcamento", { error: insErr.message });
          return { ok: false };
        }

        return { ok: true, leadId: novoLead?.id, atualizado: false, orcamento };
      }
    }

    return { ok: false };
  } catch (err) {
    logger.warn("[orcamento-grafico] excecao ao sincronizar orcamento com lead", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}
