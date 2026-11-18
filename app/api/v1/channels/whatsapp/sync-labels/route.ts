import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels/session-ref";
import { getWahaClient } from "@/lib/waha/client";
import { listarEtiquetasWaha, obterChatsPorEtiquetaWaha } from "@/lib/waha/labels";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { sincronizarEtapaDoFunilPorTags } from "@/lib/leads/sincronia-tags-funil";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const admin = createAdminClient();
  const wahaClient = getWahaClient();

  if (!wahaClient) {
    return fail("waha_not_configured", "WAHA não está configurado.", 503, { requestId });
  }

  try {
    // 1. Carrega sessões WAHA ativas da organização
    const { data: sessions, error: sessErr } = await admin
      .from("channel_sessions")
      .select(`${CHANNEL_SESSION_REF_COLUMNS}, id`)
      .eq("organization_id", orgId)
      .eq("provider", "waha")
      .is("archived_at", null);

    if (sessErr || !sessions || sessions.length === 0) {
      return ok({ synced_conversations: 0, total_labels: 0, message: "Nenhuma sessão ativa." }, { requestId });
    }

    let totalLabelsCount = 0;
    const conversationTagsMap = new Map<string, Set<string>>();

    for (const sess of sessions) {
      const sessionRef = resolveSessionRef(sess as unknown as ChannelSessionRef);
      if (!sessionRef) continue;

      let labels: Array<{ id: string; name: string }>;
      try {
        labels = await listarEtiquetasWaha(sessionRef, wahaClient);
      } catch (err) {
        logger.warn("[sync-labels] falha ao listar etiquetas da sessão", {
          sessionRef,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      totalLabelsCount += labels.length;

      for (const label of labels) {
        const tagName = label.name.trim().toLowerCase();
        if (!tagName) continue;

        let chats: Array<{ id: string; pnJid?: string; accountLid?: string }>;
        try {
          chats = await obterChatsPorEtiquetaWaha(sessionRef, label.id, wahaClient);
        } catch {
          continue;
        }

        for (const chat of chats) {
          const identifiers = [chat.id, chat.accountLid, chat.pnJid].filter(Boolean) as string[];

          for (const rawId of identifiers) {
            const digits = rawId.replace(/@.*$/, "").replace(/^\+/, "");
            const ehLid = rawId.endsWith("@lid");

            let contatoId: string | null = null;

            if (ehLid) {
              const { data: cLid } = await admin
                .from("contacts")
                .select("id")
                .eq("organization_id", orgId)
                .or(`wa_lid.eq.${digits},wa_identity.eq.lid:${digits}`)
                .limit(1)
                .maybeSingle();

              if (cLid) contatoId = cLid.id;
            } else {
              const variantes = phoneLookupVariants(digits);
              const phones = [...variantes, ...variantes.map((v) => v.replace(/\D/g, "")), `+${digits}`, digits];
              const uniquePhones = [...new Set(phones)];

              const { data: cPhone } = await admin
                .from("contacts")
                .select("id")
                .eq("organization_id", orgId)
                .in("phone_number", uniquePhones)
                .limit(1)
                .maybeSingle();

              if (cPhone) contatoId = cPhone.id;
            }

            if (contatoId) {
              const { data: conv } = await admin
                .from("conversations")
                .select("id, tags")
                .eq("organization_id", orgId)
                .eq("contact_id", contatoId)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (conv) {
                if (!conversationTagsMap.has(conv.id)) {
                  conversationTagsMap.set(conv.id, new Set(conv.tags ?? []));
                }
                conversationTagsMap.get(conv.id)!.add(tagName);
              }
              break; // Já associou este chat
            }
          }
        }
      }
    }

    // Persiste as tags atualizadas
    let updatedCount = 0;
    for (const [convId, tagSet] of conversationTagsMap.entries()) {
      const tagsArray = [...tagSet];
      await admin
        .from("conversations")
        .update({ tags: tagsArray, updated_at: new Date().toISOString() })
        .eq("id", convId);

      void sincronizarEtapaDoFunilPorTags(admin as never, {
        organizationId: orgId,
        conversationId: convId,
        tags: tagsArray,
      });

      updatedCount++;
    }

    return ok(
      {
        synced_conversations: updatedCount,
        total_labels: totalLabelsCount,
      },
      { requestId },
    );
  } catch (err) {
    logger.error("[sync-labels] erro na sincronização em massa", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Erro ao sincronizar etiquetas do canal.", 500, { requestId });
  }
}
