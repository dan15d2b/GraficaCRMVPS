/**
 * TAGS DE CONTATO INTERNO (#2353) — a régua de "este contato não é negócio".
 *
 * ═══ O problema, medido ═══
 *
 * No mesmo número escrevem clientes E gente que nunca vai ser negócio: equipe,
 * sócio, família, fornecedor. Toda primeira mensagem cria card no funil de
 * entrada (`lib/leads/nascimento-do-lead.ts`) e o ÚNICO motivo para não criar
 * era `contato_bloqueado` — que é opt-out e também corta o envio, então não
 * serve para quem a gente continua atendendo.
 *
 * ═══ Onde a lista mora ═══
 *
 * `organizations.settings.crm.internal_contact_tags` — o MESMO bolso jsonb da
 * regra `cliente_pela_agenda` (migration 0262). Nenhuma coluna nem tabela nova:
 * a organização já procura ali as regras de CRM, e a leitura/escrita é
 * `lib/schemas/settings.ts` (`tagsInternasDaOrg`) + a ação
 * `definirTagsDeContatoInterno`.
 *
 * ═══ O que uma tag interna decide ═══
 *
 *   1. o contato NÃO vira card — quem recusa é `garantirLeadDaConversa`, com o
 *      motivo `contato_interno`;
 *   2. a IA NÃO responde — o veto `contato_interno` do gate de elegibilidade
 *      (`lib/ai/elegibilidade/gate.ts`), igual a uma conversa em "Assumir", sem
 *      pausar uma por uma;
 *   3. a conversa SEGUE normal na Inbox, inclusive para envio manual — o
 *      caminho do operador não é tocado (a diferença para o bloqueio).
 *
 * ═══ Fail-open, e por quê ═══
 *
 * Leitura que falha devolve lista vazia ("nenhum contato é interno"). Errar para
 * o comportamento de ANTES é visível e corrigível; lançar no caminho quente da
 * ingestão impediria mensagens de entrar. O silêncio não some: vai para o log
 * com a organização, como o irmão `cliente-pela-agenda.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { tagsInternasDaOrg } from "@/lib/schemas/settings";

import { normalizarTags } from "./tag-normalizada";

export const TAGS_IGNORADAS_PADRAO = [
  "fornecedor",
  "instalador",
  "parceiro",
  "equipe",
  "ignorar_ia",
  "sem_ia",
  "nao_responder",
] as const;

/**
 * O contato ou a conversa tem alguma etiqueta da lista interna ou ignorada?
 */
export function ehContatoOuConversaInterno(
  tags: readonly string[] | null | undefined,
  tagsInternas: readonly string[] | null | undefined,
): boolean {
  const internas = new Set([
    ...TAGS_IGNORADAS_PADRAO,
    ...normalizarTags(tagsInternas ?? []),
  ]);
  return normalizarTags(tags ?? []).some((tag) => internas.has(tag));
}

/**
 * O contato tem alguma etiqueta da lista interna?
 *
 * A comparação normaliza os DOIS lados (`normalizarTag`: minúscula, aparada) —
 * a mesma forma em que o banco guarda as tags de contato desde a migration
 * 0324, mas sem depender de o dado estar limpo: a lista configurada à mão e a
 * tag vinda de importação de planilha são conferidas pela MESMA régua, e
 * `Interno`/`interno` não divergem.
 */
export function ehContatoInterno(
  tagsDoContato: readonly string[] | null | undefined,
  tagsInternas: readonly string[] | null | undefined,
): boolean {
  return ehContatoOuConversaInterno(tagsDoContato, tagsInternas);
}

/**
 * A MESMA régua de `ehContatoInterno`, escrita em SQL — para os predicados que
 * decidem o envio ANTES de existir um contato em JS.
 */
export function sqlContatoInterno(referenciaDoContato: string): string {
  return `(
    (${referenciaDoContato}.tags && array['fornecedor', 'instalador', 'parceiro', 'equipe', 'ignorar_ia', 'sem_ia', 'nao_responder']::text[])
    or exists (
      select 1
        from organizations o
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(o.settings -> 'crm' -> 'internal_contact_tags') = 'array'
               then o.settings -> 'crm' -> 'internal_contact_tags'
               else '[]'::jsonb end
        ) as interna(valor)
        cross join lateral unnest(${referenciaDoContato}.tags) as do_contato(etiqueta)
       where o.id = ${referenciaDoContato}.organization_id
         and left(lower(btrim(interna.valor)), 40) <> ''
         and left(lower(btrim(do_contato.etiqueta)), 40) = left(lower(btrim(interna.valor)), 40)
    )
  )`;
}

/**
 * Cláusula SQL para verificar se a CONVERSA possui tags internas ou ignoradas pela IA.
 */
export function sqlConversaInterna(referenciaDaConversa: string): string {
  return `(
    (${referenciaDaConversa}.tags && array['fornecedor', 'instalador', 'parceiro', 'equipe', 'ignorar_ia', 'sem_ia', 'nao_responder']::text[])
    or exists (
      select 1
        from organizations o
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(o.settings -> 'crm' -> 'internal_contact_tags') = 'array'
               then o.settings -> 'crm' -> 'internal_contact_tags'
               else '[]'::jsonb end
        ) as interna(valor)
        cross join lateral unnest(${referenciaDaConversa}.tags) as da_conversa(etiqueta)
       where o.id = ${referenciaDaConversa}.organization_id
         and left(lower(btrim(interna.valor)), 40) <> ''
         and left(lower(btrim(da_conversa.etiqueta)), 40) = left(lower(btrim(interna.valor)), 40)
    )
  )`;
}

/**
 * Lê a lista de etiquetas internas da organização (servidor, service role).
 *
 * `organizationId` vem sempre de fonte confiável (o chamador já filtrou por
 * ela); o filtro explícito é a regra de todo acesso com service role. Falha
 * devolve lista vazia — o contato segue o caminho de antes desta feature.
 */
export async function lerTagsInternas(
  db: SupabaseClient,
  organizationId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    logger.warn("[tags-internas] leitura da lista falhou", {
      organization_id: organizationId,
      error: error.message,
    });
    return [];
  }
  if (!data) return [];
  return tagsInternasDaOrg((data as { settings?: unknown }).settings);
}
