import type { SupabaseClient } from "@supabase/supabase-js";
import { predicadoDoMarcador } from "@/lib/inbox/marcador-da-conversa";

const TAGS_FAZER_ORCAMENTO = [
  "fazer orçamento",
  "Fazer Orçamento",
  "fazer_orcamento",
  "fazer orcamento",
  "orçamento",
  "orcamento",
] as const;

const LIMITE_CHARS_IDS_URL = 6000;

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function limitarIdsParaUrl(ids: string[]): string[] {
  const resultado: string[] = [];
  let total = 0;
  for (const id of ids) {
    const adicional = resultado.length === 0 ? id.length : id.length + 1;
    if (total + adicional > LIMITE_CHARS_IDS_URL) break;
    resultado.push(id);
    total += adicional;
  }
  return resultado;
}

export interface CriteriosOrcamento {
  contactIds: string[];
}

/**
 * Resolve os critérios compartilhados entre listagem e contador para a aba
 * "Fazer orçamento": contatos com negócio aberto numa etapa de orçamento e
 * marcadores equivalentes na conversa ou no contato.
 */
export async function resolverCriteriosOrcamento(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CriteriosOrcamento> {
  const { data: etapas } = await supabase
    .from("crm_stages")
    .select("id, name, slug")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .eq("is_won", false)
    .eq("is_lost", false);

  const stageIds = (etapas ?? [])
    .filter((etapa) => {
      const texto = normalizarTexto(`${etapa.name ?? ""} ${etapa.slug ?? ""}`);
      return texto.includes("orcamento");
    })
    .map((etapa) => etapa.id as string);

  if (stageIds.length === 0) {
    return { contactIds: [] };
  }

  const { data: leads } = await supabase
    .from("crm_leads")
    .select("contact_id")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .in("stage_id", stageIds)
    .not("contact_id", "is", null)
    .order("updated_at", { ascending: false });

  const unicos = Array.from(
    new Set(
      (leads ?? [])
        .map((l) => (l as { contact_id: string | null }).contact_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  return {
    contactIds: limitarIdsParaUrl(unicos),
  };
}

/**
 * Aplica o filtro PostgREST unificado de "Fazer orçamento" sobre queries da
 * tabela `conversations` (listagem paginada e contadores).
 */
export function aplicarFiltroDeOrcamento<C extends { or: (filtro: string) => C }>(
  query: C,
  criterios: CriteriosOrcamento,
): C {
  const partes: string[] = [];

  if (criterios.contactIds.length > 0) {
    partes.push(`contact_id.in.(${criterios.contactIds.join(",")})`);
  }

  for (const tag of TAGS_FAZER_ORCAMENTO) {
    partes.push(predicadoDoMarcador(tag));
  }

  return query.or(partes.join(","));
}
