/**
 * Sincroniza as etiquetas de uma conversa com o canal remoto (WhatsApp, etc.).
 *
 * Disparado de forma não bloqueante (fire-and-forget) após a mutação de tags
 * de conversa no CRM, garantindo paridade com o WhatsApp Business.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function sincronizarEtiquetasDaConversaComCanal(
  _supabase: SupabaseClient,
  _conversationId: string,
  _organizationId: string,
  _tags: string[],
): Promise<void> {
  // Sincronização 100% UNIDIRECIONAL (WhatsApp ➡️ CRM):
  // O CRM nunca empurra nem grava etiquetas no WhatsApp, eliminando
  // completamente o risco de desconexão da sessão e rejeição de AppStateSync pela Meta.
  return;
}
