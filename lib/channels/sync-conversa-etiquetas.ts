/**
 * Sincroniza as etiquetas de uma conversa com o canal remoto (WhatsApp, etc.).
 *
 * Disparado de forma não bloqueante (fire-and-forget) após a mutação de tags
 * de conversa no CRM, garantindo paridade com o WhatsApp Business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "@/lib/channels";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels/session-ref";
import type { ProviderDeMensagem } from "@/lib/channels/types";
import { logger } from "@/lib/logger";

interface ContatoInfo {
  phone_number?: string | null;
  wa_identity?: string | null;
  wa_lid?: string | null;
}

export async function sincronizarEtiquetasDaConversaComCanal(
  supabase: SupabaseClient,
  conversationId: string,
  organizationId: string,
  tags: string[],
): Promise<void> {
  try {
    const { data: conv, error } = await supabase
      .from("conversations")
      .select(`
        id, channel, channel_session_id, is_group, group_chat_id,
        contacts:contact_id (phone_number, wa_identity, wa_lid),
        channel_sessions:channel_session_id (${CHANNEL_SESSION_REF_COLUMNS})
      `)
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !conv) {
      if (error) {
        logger.warn("[syncChatLabels] erro ao carregar conversa para sync de etiquetas", {
          conversation_id: conversationId,
          error: error.message,
        });
      }
      return;
    }

    // Não sincroniza etiquetas com grupos
    if (conv.is_group) return;

    if (!conv.channel_sessions) return;
    const rawSession = conv.channel_sessions;
    const session = (Array.isArray(rawSession) ? rawSession[0] : rawSession) as unknown as ChannelSessionRef;
    if (!session || !session.provider) return;

    const sessionRef = resolveSessionRef(session);
    const adapter = getAdapter(session.provider as ProviderDeMensagem);
    if (!adapter || !adapter.syncChatLabels) return;

    const rawContact = conv.contacts;
    const contact = (Array.isArray(rawContact) ? rawContact[0] : rawContact) as ContatoInfo | null;
    const chatId = adapter.resolveRecipient({
      isGroup: false,
      groupChatId: null,
      phoneNumber: contact?.phone_number,
      waIdentity: contact?.wa_identity,
      waLid: contact?.wa_lid,
    });

    if (!chatId) return;

    await adapter.syncChatLabels({
      sessionRef,
      chatId,
      tags,
      orgId: organizationId,
    });
  } catch (err) {
    logger.warn("[syncChatLabels] falha ao sincronizar etiquetas com o canal", {
      conversation_id: conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
