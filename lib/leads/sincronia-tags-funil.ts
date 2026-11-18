/**
 * SINCRONIA AUTOMÁTICA ENTRE TAGS DA CONVERSA E ETAPAS DO FUNIL
 *
 * Quando uma tag de conversa é adicionada (pelo WhatsApp ou na interface do CRM),
 * este serviço mapeia a tag para a etapa correspondente do pipeline do lead e
 * move o lead automaticamente, emitindo os eventos necessários para disparar
 * follow-ups e atualizar o Kanban em tempo real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface MapeamentoDeEtapa {
  padraoTag: RegExp;
  palavrasChave: string[];
}

const MAPEAMENTOS_ETAPA: Record<string, string[]> = {
  orcamento: ["fazer orcamento", "fazer orçamento", "orcamento", "orçamento"],
  acompanhar: ["acompanhar", "acompanhar proposta", "proposta enviada", "followup", "follow-up"],
  producao: [
    "produto em andamento",
    "pedido em andamento",
    "em producao",
    "em produção",
    "producao",
    "produção",
  ],
  retirada: ["pronto para retirada", "pronto retirada", "retirada"],
  instalacao: [
    "pronto para instalacao",
    "pronto para instalação",
    "pronto para entrega",
    "instalacao",
    "instalação",
    "entrega",
  ],
  concluido: ["concluido", "concluído", "finalizado", "entregue"],
};

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function identificarIntencaoDeEtapaPorTags(tags: readonly string[]): string | null {
  for (const rawTag of tags) {
    const normalizada = normalizarTexto(rawTag);
    for (const [chaveEtapa, termos] of Object.entries(MAPEAMENTOS_ETAPA)) {
      if (termos.some((termo) => normalizada === normalizarTexto(termo) || normalizada.includes(normalizarTexto(termo)))) {
        return chaveEtapa;
      }
    }
  }
  return null;
}

export async function sincronizarEtapaDoFunilPorTags(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string;
    tags: string[];
  },
): Promise<{ movidos: number; etapaNome?: string }> {
  const chaveIntencao = identificarIntencaoDeEtapaPorTags(input.tags);
  if (!chaveIntencao) return { movidos: 0 };

  try {
    // 1. Identificar o contact_id da conversa
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("contact_id")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (convErr || !conv?.contact_id) return { movidos: 0 };

    // 2. Buscar leads abertos ou recentes do contato
    const { data: leads, error: leadsErr } = await supabase
      .from("crm_leads")
      .select("id, pipeline_id, stage_id, status")
      .eq("contact_id", conv.contact_id)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (leadsErr || !leads || leads.length === 0) return { movidos: 0 };

    let movidosCount = 0;
    let nomeEtapaDestino: string | undefined;

    for (const lead of leads) {
      // 3. Buscar as etapas do pipeline do lead
      const { data: stages, error: stagesErr } = await supabase
        .from("crm_stages")
        .select("id, name, is_won, is_lost")
        .eq("pipeline_id", lead.pipeline_id)
        .eq("organization_id", input.organizationId);

      if (stagesErr || !stages || stages.length === 0) continue;

      // 4. Encontrar a etapa que casa com a intenção
      const etapaEncontrada = stages.find((s) => {
        const nomeNorm = normalizarTexto(s.name);
        const termosChave = MAPEAMENTOS_ETAPA[chaveIntencao] ?? [];
        return termosChave.some((t) => nomeNorm.includes(normalizarTexto(t)) || normalizarTexto(t).includes(nomeNorm));
      });

      if (!etapaEncontrada || etapaEncontrada.id === lead.stage_id) continue;

      // 5. Atualizar o lead para a nova etapa
      const updateData: Record<string, unknown> = {
        stage_id: etapaEncontrada.id,
        updated_at: new Date().toISOString(),
      };

      if (etapaEncontrada.is_won) {
        updateData.status = "won";
        updateData.won_at = new Date().toISOString();
      } else if (etapaEncontrada.is_lost) {
        updateData.status = "lost";
        updateData.lost_at = new Date().toISOString();
      } else if (lead.status !== "open") {
        updateData.status = "open";
      }

      const { error: updateErr } = await supabase
        .from("crm_leads")
        .update(updateData)
        .eq("id", lead.id)
        .eq("organization_id", input.organizationId);

      if (!updateErr) {
        movidosCount++;
        nomeEtapaDestino = etapaEncontrada.name;

        // 6. Emitir evento lead.stage_changed no event_log para disparar follow-ups
        try {
          await supabase.from("event_log").insert({
            organization_id: input.organizationId,
            event_type: "lead.stage_changed",
            entity_type: "lead",
            entity_id: lead.id,
            payload: {
              lead_id: lead.id,
              from_stage_id: lead.stage_id,
              to_stage_id: etapaEncontrada.id,
              pipeline_id: lead.pipeline_id,
              origem: "sync_tag_conversa",
            },
          });
        } catch (emitErr) {
          logger.warn("[sincronia-tags-funil] falha ao emitir event_log", { error: emitErr });
        }

        // 7. Registrar atividade na timeline do lead
        try {
          await supabase.from("crm_lead_activities").insert({
            organization_id: input.organizationId,
            lead_id: lead.id,
            activity_type: "stage_change",
            description: `Movido para a etapa "${etapaEncontrada.name}" pela etiqueta da conversa.`,
            metadata: {
              from_stage_id: lead.stage_id,
              to_stage_id: etapaEncontrada.id,
              trigger: "conversation_tag",
            },
          });
        } catch {
          // Fire-and-forget
        }
      }
    }

    if (movidosCount > 0) {
      logger.info("[sincronia-tags-funil] lead(s) movidos de etapa por etiqueta de conversa", {
        organization_id: input.organizationId,
        conversation_id: input.conversationId,
        movidos: movidosCount,
        etapa: nomeEtapaDestino,
      });
    }

    return { movidos: movidosCount, etapaNome: nomeEtapaDestino };
  } catch (err) {
    logger.error("[sincronia-tags-funil] erro ao processar tags de conversa", { error: err });
    return { movidos: 0 };
  }
}
