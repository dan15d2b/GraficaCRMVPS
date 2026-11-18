import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/channels";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels/session-ref";
import type { ProviderDeMensagem } from "@/lib/channels/types";
import { getWahaClient } from "@/lib/waha/client";
import { obterEtiquetasDoChatWaha } from "@/lib/waha/labels";
import { sincronizarEtapaDoFunilPorTags } from "@/lib/leads/sincronia-tags-funil";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  if (!z.uuid().safeParse(id).success) {
    return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  }

  const authz = await requireRole("viewer", { requestId });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const admin = createAdminClient();

  try {
    const { data: conv, error } = await admin
      .from("conversations")
      .select(`
        id, organization_id, channel, channel_session_id, is_group, group_chat_id, tags,
        contacts:contact_id (id, phone_number, wa_identity, wa_lid),
        channel_sessions:channel_session_id (${CHANNEL_SESSION_REF_COLUMNS})
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error || !conv) {
      return fail("not_found", "Conversa não encontrada.", 404, { requestId });
    }

    if (conv.is_group || !conv.channel_sessions) {
      return ok({ tags: conv.tags ?? [], synced: false, reason: "unsupported" }, { requestId });
    }

    const rawSession = conv.channel_sessions;
    const session = (Array.isArray(rawSession) ? rawSession[0] : rawSession) as unknown as ChannelSessionRef;
    if (!session || !session.provider) {
      return ok({ tags: conv.tags ?? [], synced: false, reason: "no_provider" }, { requestId });
    }

    const rawContact = conv.contacts;
    const contact = (Array.isArray(rawContact) ? rawContact[0] : rawContact) as {
      id: string;
      phone_number: string | null;
      wa_identity: string | null;
      wa_lid: string | null;
    } | null;

    const sessionRef = resolveSessionRef(session);
    const wahaClient = getWahaClient();

    const remoteTags: string[] = [];

    if (session.provider === "waha" && wahaClient) {
      const chatIdsToCheck: string[] = [];
      if (contact?.wa_lid) {
        chatIdsToCheck.push(`${contact.wa_lid}@lid`);
      }
      if (contact?.phone_number) {
        const digits = contact.phone_number.replace(/\D/g, "");
        chatIdsToCheck.push(`${digits}@c.us`);
        chatIdsToCheck.push(`${digits}@s.whatsapp.net`);
      }

      for (const cid of chatIdsToCheck) {
        try {
          const labels = await obterEtiquetasDoChatWaha(sessionRef, cid, wahaClient);
          if (Array.isArray(labels) && labels.length > 0) {
            for (const l of labels) {
              if (l.name) remoteTags.push(l.name.trim().toLowerCase());
            }
          }
        } catch {
          // Continua tentando outros formatos de identificador
        }
      }
    }

    const currentTags = Array.isArray(conv.tags) ? conv.tags : [];
    const mergedTags = [...new Set([...currentTags, ...remoteTags])];

    // Atualiza conversa no banco com as tags mescladas
    await admin
      .from("conversations")
      .update({ tags: mergedTags, updated_at: new Date().toISOString() })
      .eq("id", conv.id);

    // Se houver tags do CRM que ainda não estão no WhatsApp, sincroniza de volta
    const adapter = getAdapter(session.provider as ProviderDeMensagem);
    if (adapter && adapter.syncChatLabels) {
      const chatId = adapter.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: contact?.phone_number,
        waIdentity: contact?.wa_identity,
        waLid: contact?.wa_lid,
      });

      if (chatId) {
        try {
          await adapter.syncChatLabels({
            sessionRef,
            chatId,
            tags: mergedTags,
            orgId,
          });
        } catch (syncErr) {
          logger.warn("[sync-tags] falha ao enviar tags atualizadas para canal", {
            conversation_id: conv.id,
            error: syncErr instanceof Error ? syncErr.message : String(syncErr),
          });
        }
      }
    }

    // Sincroniza etapa do funil automaticamente
    void sincronizarEtapaDoFunilPorTags(admin as never, {
      organizationId: orgId,
      conversationId: conv.id,
      tags: mergedTags,
    });

    return ok(
      {
        tags: mergedTags,
        remote_tags: remoteTags,
        synced: true,
      },
      { requestId },
    );
  } catch (err) {
    logger.error("[sync-tags] falha geral", {
      conversation_id: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Erro ao sincronizar tags com o WhatsApp.", 500, { requestId });
  }
}
