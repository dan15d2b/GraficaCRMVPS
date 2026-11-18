import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const AplicarOrcamentoSchema = z.object({
  conversation_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  valor_total_cents: z.number().int().nonnegative(),
  prazo_dias_uteis: z.number().int().min(1).default(5),
  forma_pagamento: z.string().optional(),
  numero_orcamento: z.string().optional(),
  mensagem_formatada: z.string().min(1),
  enviar_whatsapp: z.boolean().default(false),
  itens: z.array(z.record(z.string(), z.unknown())).optional(),
});

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "orcamentos" });
  if (!authz.ok) return authz.response;

  const body = await req.json().catch(() => null);
  const parsed = AplicarOrcamentoSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos para aplicação do orçamento.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const {
    conversation_id,
    contact_id: inputContactId,
    lead_id: inputLeadId,
    valor_total_cents,
    prazo_dias_uteis,
    forma_pagamento,
    numero_orcamento,
    mensagem_formatada,
    enviar_whatsapp,
    itens,
  } = parsed.data;

  const admin = createAdminClient();

  // 1. Resolver contact_id a partir da conversa se necessário
  let contactId = inputContactId;
  if (!contactId) {
    const { data: conv } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("id", conversation_id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();

    if (conv?.contact_id) contactId = conv.contact_id;
  }

  if (!contactId) {
    return fail("not_found", "Contato associado à conversa não encontrado.", 404, { requestId });
  }

  // 2. Buscar ou vincular lead ativo
  let leadId = inputLeadId;
  if (!leadId) {
    const { data: leadAtivo } = await admin
      .from("crm_leads")
      .select("id, pipeline_id, stage_id, status")
      .eq("organization_id", authz.org.orgId)
      .eq("contact_id", contactId)
      .neq("status", "lost")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadAtivo) {
      leadId = leadAtivo.id;
    }
  }

  // Se ainda não existir lead, buscar primeiro funil da organização para criar
  if (!leadId) {
    const { data: defaultPipeline } = await admin
      .from("crm_pipelines")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultPipeline) {
      const { data: firstStage } = await admin
        .from("crm_stages")
        .select("id")
        .eq("pipeline_id", defaultPipeline.id)
        .eq("organization_id", authz.org.orgId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstStage) {
        const { data: novoLead } = await admin
          .from("crm_leads")
          .insert({
            organization_id: authz.org.orgId,
            contact_id: contactId,
            pipeline_id: defaultPipeline.id,
            stage_id: firstStage.id,
            title: `Orçamento ${numero_orcamento ? `#${numero_orcamento}` : "Gráfica"}`,
            value_cents: valor_total_cents,
            status: "open",
          })
          .select("id")
          .single();

        if (novoLead) leadId = novoLead.id;
      }
    }
  }

  // 3. Atualizar lead com valor e mover para etapa de Proposta / Acompanhamento
  let etapaDestinoNome = "";
  if (leadId) {
    const { data: lead } = await admin
      .from("crm_leads")
      .select("id, pipeline_id, stage_id")
      .eq("id", leadId)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();

    if (lead?.pipeline_id) {
      // Buscar etapas do funil para encontrar "Acompanhar Proposta" ou "Orçamento"
      const { data: stages } = await admin
        .from("crm_stages")
        .select("id, name")
        .eq("pipeline_id", lead.pipeline_id)
        .eq("organization_id", authz.org.orgId);

      const termosAcompanhar = [
        "acompanhar proposta",
        "proposta enviada",
        "orcamento",
        "orçamento",
        "proposta",
      ];

      const etapaAlvo = stages?.find((s) => {
        const norm = normalizarTexto(s.name);
        return termosAcompanhar.some((t) => norm.includes(t) || t.includes(norm));
      });

      const patch: Record<string, unknown> = {
        value_cents: valor_total_cents,
        updated_at: new Date().toISOString(),
      };

      if (etapaAlvo && etapaAlvo.id !== lead.stage_id) {
        patch.stage_id = etapaAlvo.id;
        etapaDestinoNome = etapaAlvo.name;
      }

      await admin
        .from("crm_leads")
        .update(patch)
        .eq("id", lead.id)
        .eq("organization_id", authz.org.orgId);

      // Registrar timeline
      try {
        const numLabel = numero_orcamento ? ` #${numero_orcamento}` : "";
        const valorFormatado = (valor_total_cents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        await admin.from("crm_lead_activities").insert({
          organization_id: authz.org.orgId,
          lead_id: lead.id,
          activity_type: "proposal_created",
          description: `Orçamento${numLabel} de ${valorFormatado} importado. Prazo: ${prazo_dias_uteis} dias úteis.`,
          metadata: {
            valor_total_cents,
            prazo_dias_uteis,
            forma_pagamento,
            numero_orcamento,
            itens_count: itens?.length || 0,
          },
        });
      } catch {
        // Fire-and-forget
      }
    }
  }

  // 4. Se solicitado envio imediato para o WhatsApp
  if (enviar_whatsapp) {
    try {
      await sendMessageHandler(
        admin,
        {
          organization_id: authz.org.orgId,
          actor: { type: "user", id: authz.user.id },
          requestId: randomUUID(),
        },
        {
          conversation_id,
          body: mensagem_formatada,
          type: "text",
        },
      );
    } catch (msgErr) {
      logger.warn("[orcamentos.aplicar] falha ao despachar mensagem no whatsapp", {
        error: msgErr,
      });
    }
  }

  return ok(
    {
      lead_id: leadId,
      etapa_destino: etapaDestinoNome || undefined,
      valor_total_cents,
      mensagem_formatada,
      enviado_whatsapp: enviar_whatsapp,
    },
    { requestId },
  );
}
