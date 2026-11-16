/**
 * POST /api/v1/channels/labels/import — importa etiquetas do WhatsApp para o DeskcommCRM.
 *
 * Exige papel de manager ou superior. Puxa as etiquetas remotas da sessão ativa,
 * inclui no vocabulário canônico da organização (preservando cor) e aplica nas conversas existentes.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { getAdapter } from "@/lib/channels";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels/session-ref";
import type { ProviderDeMensagem } from "@/lib/channels/types";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "channels" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const supabase = await createClient();

  // 1. Localizar a sessão do WhatsApp ativa da organização
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("channel_sessions")
    .select(`id, provider, ${CHANNEL_SESSION_REF_COLUMNS}`)
    .eq("organization_id", activeOrg.orgId)
    .is("archived_at", null)
    .eq("status", "WORKING")
    .maybeSingle();

  if (sessionErr || !sessionRow) {
    return fail(
      "not_found",
      "Nenhuma conexão ativa do WhatsApp encontrada nesta organização.",
      404,
      { requestId },
    );
  }

  const session = sessionRow as unknown as ChannelSessionRef;
  const sessionRef = resolveSessionRef(session);
  const adapter = getAdapter(session.provider as ProviderDeMensagem);

  if (!adapter?.listRemoteLabels || !adapter?.getChatsByRemoteLabel) {
    return fail(
      "bad_request",
      "O canal atual não suporta importação de etiquetas.",
      400,
      { requestId },
    );
  }

  // 2. Buscar todas as etiquetas remotas
  const remoteLabels = await adapter.listRemoteLabels({ sessionRef });

  // 3. Atualizar vocabulário canônico da organização
  const { data: orgData } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const currentSettings = (orgData?.settings as Record<string, unknown> | null) ?? {};
  const currentCanonicas: string[] = Array.isArray(currentSettings["canonical_conversation_tags"])
    ? (currentSettings["canonical_conversation_tags"] as string[])
    : [];

  const currentCores: Array<{ tag: string; cor: string }> = Array.isArray(currentSettings["tags"])
    ? (currentSettings["tags"] as Array<{ tag: string; cor: string }>)
    : [];

  const canonicasSet = new Set(currentCanonicas.map((t) => t.trim()));
  const coresMap = new Map(currentCores.map((c) => [c.tag.trim().toLowerCase(), c]));

  for (const rl of remoteLabels) {
    const nomeNorm = rl.name.trim();
    if (!nomeNorm) continue;
    const key = nomeNorm.toLowerCase();
    const hex = rl.colorHex ?? "#6f6f6f";

    canonicasSet.add(nomeNorm);
    if (!coresMap.has(key)) {
      coresMap.set(key, { tag: nomeNorm, cor: hex });
    }
  }

  const novasCanonicas = Array.from(canonicasSet);
  const novasCores = Array.from(coresMap.values());

  await supabase
    .from("organizations")
    .update({
      settings: {
        ...currentSettings,
        canonical_conversation_tags: novasCanonicas,
        tags: novasCores,
      },
    })
    .eq("id", activeOrg.orgId);

  // 4. Mapear chats etiquetados para as conversas do CRM
  let conversasEtiquetadas = 0;

  for (const rl of remoteLabels) {
    const tagNorm = rl.name.trim().toLowerCase();
    if (!tagNorm) continue;

    try {
      const chats = await adapter.getChatsByRemoteLabel({ sessionRef, labelId: rl.id });
      for (const rawChatId of chats) {
        const rawDigits = rawChatId.replace(/@.*$/, "").replace(/^\+/, "");
        const ehLid = rawChatId.endsWith("@lid");

        let filtroContato: string;
        if (ehLid) {
          filtroContato = `wa_lid.eq.${rawDigits},wa_identity.eq.lid:${rawDigits}`;
        } else {
          const variantes = phoneLookupVariants(rawDigits);
          const parts: string[] = [];
          for (const v of variantes) {
            const d = v.replace(/\D/g, "");
            parts.push(`phone_number.eq.${v}`);
            parts.push(`phone_number.eq.${d}`);
            parts.push(`wa_identity.eq.phone:${v}`);
            parts.push(`wa_identity.eq.phone:${d}`);
          }
          filtroContato = parts.length > 0 ? parts.join(",") : `phone_number.eq.+${rawDigits}`;
        }

        const { data: contato } = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", activeOrg.orgId)
          .or(filtroContato)
          .maybeSingle();

        if (!contato) continue;

        const { data: conv } = await supabase
          .from("conversations")
          .select("id, tags")
          .eq("organization_id", activeOrg.orgId)
          .eq("contact_id", contato.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv) {
          const currentTags: string[] = Array.isArray(conv.tags) ? conv.tags : [];
          if (!currentTags.includes(tagNorm)) {
            const nextTags = [...currentTags, tagNorm];
            await supabase
              .from("conversations")
              .update({ tags: nextTags })
              .eq("id", conv.id);
            conversasEtiquetadas++;
          }
        }
      }
    } catch {
      // Ignora falha por etiqueta
    }
  }

  return ok(
    {
      etiquetas_importadas: remoteLabels.length,
      conversas_etiquetadas: conversasEtiquetadas,
    },
    { requestId },
  );
}
