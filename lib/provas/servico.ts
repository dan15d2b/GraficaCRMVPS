import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type {
  ArteProva,
  CriarProvaInput,
  DecidirProvaInput,
  ProvaPublicaDTO,
} from "./tipos";

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Move o lead associado para a etapa de produção do pipeline correspondente.
 */
export async function moverLeadParaProducao(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    leadId?: string | null;
    contactId?: string | null;
    osNumber?: string | null;
    decidedVia?: string | null;
  },
): Promise<{ movido: boolean; etapaNome?: string }> {
  try {
    let leadId = input.leadId;

    if (!leadId && input.contactId) {
      const { data: leadAtivo } = await supabase
        .from("crm_leads")
        .select("id, pipeline_id, stage_id, status")
        .eq("organization_id", input.organizationId)
        .eq("contact_id", input.contactId)
        .neq("status", "lost")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadAtivo) {
        leadId = leadAtivo.id;
      }
    }

    if (!leadId) return { movido: false };

    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, pipeline_id, stage_id, status")
      .eq("id", leadId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (!lead || !lead.pipeline_id) return { movido: false };

    // Buscar etapas do funil
    const { data: stages } = await supabase
      .from("crm_stages")
      .select("id, name, is_won, is_lost")
      .eq("pipeline_id", lead.pipeline_id)
      .eq("organization_id", input.organizationId);

    if (!stages || stages.length === 0) return { movido: false };

    // Procurar etapa que corresponda a "producao" ou "em producao"
    const termosProducao = [
      "em producao",
      "em produção",
      "producao",
      "produção",
      "produto em andamento",
      "pedido em andamento",
    ];

    const etapaProducao = stages.find((s) => {
      const nomeNorm = normalizarTexto(s.name);
      return termosProducao.some(
        (t) => nomeNorm.includes(t) || t.includes(nomeNorm),
      );
    });

    if (!etapaProducao || etapaProducao.id === lead.stage_id) {
      return { movido: false, etapaNome: etapaProducao?.name };
    }

    // Atualizar etapa do lead
    const updateData: Record<string, unknown> = {
      stage_id: etapaProducao.id,
      updated_at: new Date().toISOString(),
    };
    if (lead.status !== "open") {
      updateData.status = "open";
    }

    await supabase
      .from("crm_leads")
      .update(updateData)
      .eq("id", lead.id)
      .eq("organization_id", input.organizationId);

    // Emitir evento para o event_log
    try {
      await supabase.from("event_log").insert({
        organization_id: input.organizationId,
        event_type: "lead.stage_changed",
        entity_type: "lead",
        entity_id: lead.id,
        payload: {
          lead_id: lead.id,
          from_stage_id: lead.stage_id,
          to_stage_id: etapaProducao.id,
          pipeline_id: lead.pipeline_id,
          origem: "aprovacao_prova_digital",
        },
      });
    } catch {
      // Fire-and-forget
    }

    // Registrar timeline
    try {
      const viaLabel = input.decidedVia === "whatsapp" ? "WhatsApp" : "Link Web";
      const osLabel = input.osNumber ? ` da O.S. #${input.osNumber}` : "";
      await supabase.from("crm_lead_activities").insert({
        organization_id: input.organizationId,
        lead_id: lead.id,
        activity_type: "stage_change",
        description: `Movido para "${etapaProducao.name}" após aprovação de prova digital${osLabel} via ${viaLabel}.`,
        metadata: {
          from_stage_id: lead.stage_id,
          to_stage_id: etapaProducao.id,
          trigger: "proof_approval",
          decided_via: input.decidedVia,
          os_number: input.osNumber,
        },
      });
    } catch {
      // Fire-and-forget
    }

    return { movido: true, etapaNome: etapaProducao.name };
  } catch (err) {
    logger.error("[provas] erro ao mover lead para producao", { error: err });
    return { movido: false };
  }
}

/**
 * Cria uma nova solicitação de prova digital e opcionalmente envia mensagem no WhatsApp.
 */
export async function criarProvaDigital(
  supabase: SupabaseClient,
  input: CriarProvaInput,
): Promise<ArteProva> {
  const admin = createAdminClient();

  // 1. Resolver contact_id e lead_id a partir da conversa se não vierem
  let contactId = input.contactId;
  let conversationId = input.conversationId;

  if (!contactId && conversationId) {
    const { data: conv } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("id", conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (conv?.contact_id) {
      contactId = conv.contact_id;
    }
  }

  if (!contactId) {
    throw new Error("contact_id é obrigatório para criar a prova digital.");
  }

  let leadId = input.leadId;
  if (!leadId) {
    const { data: leadAtivo } = await admin
      .from("crm_leads")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("contact_id", contactId)
      .neq("status", "lost")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadAtivo?.id) {
      leadId = leadAtivo.id;
    }
  }

  // 2. Gerar token seguro
  const token = randomBytes(16).toString("hex");

  // 3. Salvar registro na tabela arte_provas
  const { data: prova, error: insertErr } = await admin
    .from("arte_provas")
    .insert({
      organization_id: input.organizationId,
      contact_id: contactId,
      conversation_id: conversationId,
      lead_id: leadId ?? null,
      token,
      os_number: input.osNumber?.trim() || null,
      titulo: input.titulo.trim(),
      file_url: input.fileUrl,
      file_name: input.fileName,
      file_mime: input.fileMime || "application/octet-stream",
      file_size_bytes: input.fileSizeBytes || 0,
      status: "pendente",
      created_by_user_id: input.userId ?? null,
    })
    .select()
    .single();

  if (insertErr || !prova) {
    logger.error("[provas] erro ao inserir arte_prova", { error: insertErr });
    throw new Error(insertErr?.message || "Erro ao criar registro de prova.");
  }

  // 4. Se solicitado envio via WhatsApp
  if (input.enviarWhatsapp && conversationId) {
    const baseUrl =
      input.baseUrl ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";
    const linkPublico = `${baseUrl.replace(/\/$/, "")}/prova/${token}`;

    const osLabel = input.osNumber ? ` (O.S. #${input.osNumber})` : "";
    const mensagemTexto =
      `Olá! Segue a prévia da sua arte${osLabel} para conferência de textos, telefones e cores.\n\n` +
      `Por favor, confira com atenção no link abaixo e confirme para iniciarmos a produção:\n` +
      `🔗 ${linkPublico}\n\n` +
      `*(Ou se preferir, confira e responda "Aprovado" por aqui mesmo)*\n\n` +
      `⚠️ *Atenção:* Após a aprovação, o material é enviado para impressão.`;

    try {
      await sendMessageHandler(
        admin,
        {
          organization_id: input.organizationId,
          actor: input.userId
            ? { type: "user", id: input.userId }
            : { type: "webhook_source", id: "system" },
          requestId: randomUUID(),
        },
        {
          conversation_id: conversationId,
          body: mensagemTexto,
          type: "text",
        },
      );
    } catch (msgErr) {
      logger.warn("[provas] falha ao despachar mensagem no whatsapp", {
        error: msgErr,
      });
    }
  }

  // 5. Registrar timeline no lead se existir
  if (leadId) {
    try {
      const osLabel = input.osNumber ? ` da O.S. #${input.osNumber}` : "";
      await admin.from("crm_lead_activities").insert({
        organization_id: input.organizationId,
        lead_id: leadId,
        activity_type: "proof_requested",
        description: `Prova digital "${input.titulo}"${osLabel} enviada ao cliente para aprovação.`,
        metadata: {
          proof_id: prova.id,
          token,
          file_name: input.fileName,
          os_number: input.osNumber,
        },
      });
    } catch {
      // Fire-and-forget
    }
  }

  return prova as ArteProva;
}

/**
 * Busca dados públicos de uma prova pelo token (acessível sem autenticação).
 */
export async function obterProvaPublica(
  token: string,
): Promise<ProvaPublicaDTO | null> {
  const admin = createAdminClient();

  const { data: prova, error } = await admin
    .from("arte_provas")
    .select(
      "id, organization_id, token, titulo, os_number, file_url, file_name, file_mime, file_size_bytes, status, decided_at, decided_via, rejection_reason, created_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !prova) {
    return null;
  }

  // Buscar dados da empresa para white-label
  let nomeEmpresa = "Gráfica";
  let logoUrl: string | null = null;
  let corDestaque = "#2563eb";

  try {
    const { data: org } = await admin
      .from("organizations")
      .select("name, settings")
      .eq("id", prova.organization_id)
      .maybeSingle();

    if (org?.name) nomeEmpresa = org.name;
    const settings = org?.settings as Record<string, unknown> | null;
    const branding = settings?.branding as Record<string, unknown> | null;
    if (typeof branding?.app_name === "string" && branding.app_name.trim()) {
      nomeEmpresa = branding.app_name.trim();
    }
    if (typeof branding?.logo_url === "string" && branding.logo_url.trim()) {
      logoUrl = branding.logo_url.trim();
    }
    if (typeof branding?.accent_hex === "string" && branding.accent_hex.trim()) {
      corDestaque = branding.accent_hex.trim();
    }
  } catch {
    // degrada com elegância
  }

  const fileUrlFinal =
    prova.file_url.startsWith("http://") || prova.file_url.startsWith("https://")
      ? prova.file_url
      : `/api/v1/prova/${token}/arquivo`;

  return {
    token: prova.token,
    titulo: prova.titulo,
    os_number: prova.os_number,
    file_url: fileUrlFinal,
    file_name: prova.file_name,
    file_mime: prova.file_mime,
    file_size_bytes: prova.file_size_bytes,
    status: prova.status as ArteProva["status"],
    decided_at: prova.decided_at,
    decided_via: prova.decided_via as ArteProva["decided_via"],
    rejection_reason: prova.rejection_reason,
    created_at: prova.created_at,
    empresa: {
      nome: nomeEmpresa,
      logo_url: logoUrl,
      cor_destaque: corDestaque,
    },
  };
}

/**
 * Registra a decisão do cliente (aprovar ou rejeitar) na prova digital.
 */
export async function decidirProvaDigital(
  input: DecidirProvaInput,
): Promise<{ ok: boolean; status: string; message: string }> {
  const admin = createAdminClient();

  const { data: prova, error: findErr } = await admin
    .from("arte_provas")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();

  if (findErr || !prova) {
    return { ok: false, status: "not_found", message: "Prova não encontrada." };
  }

  if (prova.status !== "pendente") {
    return {
      ok: false,
      status: "already_decided",
      message: `Esta prova já foi ${prova.status === "aprovada" ? "aprovada" : "respondida"}.`,
    };
  }

  const statusFinal = input.action === "aprovar" ? "aprovada" : "rejeitada";
  const now = new Date().toISOString();
  const decidedVia = input.decidedVia || "link";

  const { error: updateErr } = await admin
    .from("arte_provas")
    .update({
      status: statusFinal,
      decided_at: now,
      decided_via: decidedVia,
      rejection_reason: input.action === "rejeitar" ? input.notes?.trim() || null : null,
      client_ip: input.clientIp || null,
      client_user_agent: input.clientUserAgent || null,
      checklist_agreed: input.action === "aprovar",
      updated_at: now,
    })
    .eq("id", prova.id);

  if (updateErr) {
    logger.error("[provas] erro ao atualizar status da prova", { error: updateErr });
    return { ok: false, status: "internal_error", message: "Erro ao salvar decisão." };
  }

  const osLabel = prova.os_number ? ` (O.S. #${prova.os_number})` : "";

  // Se aprovada: mover lead para produção
  if (input.action === "aprovar") {
    await moverLeadParaProducao(admin, {
      organizationId: prova.organization_id,
      leadId: prova.lead_id,
      contactId: prova.contact_id,
      osNumber: prova.os_number,
      decidedVia,
    });

    // Notificar conversa no WhatsApp
    if (prova.conversation_id) {
      try {
        const msgAprovacao =
          `✅ *Prova de Arte Aprovada!*${osLabel}\n\n` +
          `O cliente confirmou a aprovação do arquivo "${prova.file_name}" via ${decidedVia === "whatsapp" ? "WhatsApp" : "Link Web"}.\n` +
          `O pedido foi liberado e encaminhado para a fila de *Produção*.`;

        await sendMessageHandler(
          admin,
          {
            organization_id: prova.organization_id,
            actor: { type: "webhook_source", id: "system" },
            requestId: randomUUID(),
          },
          {
            conversation_id: prova.conversation_id,
            body: msgAprovacao,
            type: "text",
          },
        );
      } catch (msgErr) {
        logger.warn("[provas] falha ao notificar conversa sobre aprovacao", { error: msgErr });
      }
    }
  } else {
    // Se rejeitada / pedido de ajuste:
    if (prova.conversation_id) {
      try {
        const msgAjuste =
          `✏️ *Solicitação de Ajuste na Arte*${osLabel}\n\n` +
          `O cliente solicitou alterações na arte "${prova.file_name}":\n\n` +
          `"${input.notes?.trim() || "Solicitado ajuste pelo cliente"}"\n\n` +
          `Favor verificar com a equipe de criação.`;

        await sendMessageHandler(
          admin,
          {
            organization_id: prova.organization_id,
            actor: { type: "webhook_source", id: "system" },
            requestId: randomUUID(),
          },
          {
            conversation_id: prova.conversation_id,
            body: msgAjuste,
            type: "text",
          },
        );
      } catch (msgErr) {
        logger.warn("[provas] falha ao notificar conversa sobre rejeicao", { error: msgErr });
      }
    }

    if (prova.lead_id) {
      try {
        await admin.from("crm_lead_activities").insert({
          organization_id: prova.organization_id,
          lead_id: prova.lead_id,
          activity_type: "proof_rejected",
          description: `Cliente solicitou ajuste na prova digital${osLabel}: "${input.notes?.trim() || "Sem observações"}"`,
          metadata: {
            proof_id: prova.id,
            notes: input.notes,
            decided_via: decidedVia,
          },
        });
      } catch {
        // Fire-and-forget
      }
    }
  }

  return {
    ok: true,
    status: statusFinal,
    message: input.action === "aprovar" ? "Prova aprovada com sucesso!" : "Solicitação de ajuste enviada.",
  };
}
