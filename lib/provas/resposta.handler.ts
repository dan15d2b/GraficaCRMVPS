/**
 * Handler de evento que detecta quando o cliente aprova uma prova digital
 * respondendo diretamente no WhatsApp (ex: "Aprovado", "Pode rodar", "OK").
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { textoDoPayloadInbound } from "@/lib/followup/aplicar-inbound";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidirProvaDigital } from "./servico";

export const PROVA_RESPOSTA_HANDLER_KEY = "prova-resposta.v1";

function ehConfirmacaoDeProva(texto: string): boolean {
  if (!texto) return false;

  const norm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!.,?]/g, "")
    .trim();

  const PADROES_EXATOS = new Set([
    "aprovado",
    "aprovada",
    "aprovo",
    "aprovado pode rodar",
    "pode rodar",
    "pode imprimir",
    "pode produzir",
    "ta aprovado",
    "ta aprovada",
    "ok pode rodar",
    "ok aprovado",
    "ok",
    "autorizado",
    "autorizada",
    "autorizo",
    "perfeito pode rodar",
    "sim aprovado",
    "sim aprovada",
    "fechado pode rodar",
    "pode mandar rodar",
  ]);

  if (PADROES_EXATOS.has(norm)) return true;

  // Frases que começam com "aprovado" ou "pode rodar"
  if (
    norm.startsWith("aprovado") ||
    norm.startsWith("aprovada") ||
    norm.startsWith("pode rodar") ||
    norm.startsWith("pode imprimir")
  ) {
    return true;
  }

  return false;
}

export const provaRespostaHandler: EventHandler = {
  key: PROVA_RESPOSTA_HANDLER_KEY,
  naOrgParada: "roda",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId =
      typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return {
        consumer_key: PROVA_RESPOSTA_HANDLER_KEY,
        status: "skipped",
        detail: "evento_sem_contact_id",
      };
    }

    const texto = textoDoPayloadInbound(row.payload as Record<string, unknown>);
    if (!texto || !ehConfirmacaoDeProva(texto)) {
      return {
        consumer_key: PROVA_RESPOSTA_HANDLER_KEY,
        status: "skipped",
        detail: "texto_nao_e_aprovacao",
      };
    }

    const admin = createAdminClient();

    // Buscar se há prova pendente para este contato nesta organização
    const { data: prova, error } = await admin
      .from("arte_provas")
      .select("id, token, os_number, file_name")
      .eq("organization_id", row.organization_id)
      .eq("contact_id", contactId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !prova) {
      return {
        consumer_key: PROVA_RESPOSTA_HANDLER_KEY,
        status: "skipped",
        detail: "sem_prova_pendente",
      };
    }

    // Executar a aprovação da prova via WhatsApp
    const resultado = await decidirProvaDigital({
      token: prova.token,
      action: "aprovar",
      decidedVia: "whatsapp",
    });

    return {
      consumer_key: PROVA_RESPOSTA_HANDLER_KEY,
      status: resultado.ok ? "ok" : "error",
      detail: `prova_${prova.id}_aprovada_whatsapp`,
    };
  },
};
