import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { buscaEmLotes } from "@/lib/supabase/em-lotes";
import { traduzir } from "@/lib/i18n/dicionario";
import { classificarEtapa, calcularPrazo } from "./prazo";
import type { ItemDeProducao, EtapaProducaoRef } from "./types";
import { ProducaoClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Controle de Produção",
  description: "Fila de impressão, prazos de entrega e expedição de ordens de serviço",
};

interface PipelineRow {
  id: string;
  name: string;
  is_default: boolean;
  position: number;
}

interface StageRow {
  id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  position: number;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

interface ContactRow {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
}

export default async function ProducaoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();

  // 1. Funis da organização
  const { data: pipelinesData } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default, position")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const pipelines = (pipelinesData ?? []) as PipelineRow[];
  const pipelineIds = pipelines.map((p) => p.id);

  if (pipelineIds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h2 className="text-xl font-semibold">Nenhum funil configurado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie seu primeiro funil em CRM &gt; Funis para habilitar o controle de produção.
        </p>
      </div>
    );
  }

  // 2. Etapas de todos os funis ativos
  const { data: stagesData } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, name, slug, position, color, is_won, is_lost")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .in("pipeline_id", pipelineIds)
    .order("position");

  const stages = (stagesData ?? []) as StageRow[];

  // Classifica etapas
  const etapasProducao: EtapaProducaoRef[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    pipeline_id: s.pipeline_id,
    color: s.color,
    is_won: s.is_won,
    tipo: classificarEtapa(s),
  }));

  // Etapas alvo da produção (produção, retirada, instalação)
  const etapasAlvo = etapasProducao.filter(
    (e) => e.tipo === "producao" || e.tipo === "retirada" || e.tipo === "instalacao",
  );
  const etapasAlvoIds =
    etapasAlvo.length > 0
      ? etapasAlvo.map((e) => e.id)
      : stages.filter((s) => !s.is_lost && !s.is_won).map((s) => s.id);

  // 3. Busca de leads nas etapas operacionais
  const { data: leadsData } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("organization_id", activeOrg.orgId)
    .neq("status", "lost")
    .in("stage_id", etapasAlvoIds)
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const rawLeads = leadsData ?? [];

  // 4. Carrega dados dos contatos vinculados
  const contactIds = [
    ...new Set(
      rawLeads.map((l) => l.contact_id).filter((c): c is string => typeof c === "string" && !!c),
    ),
  ];

  let contactsMap = new Map<string, ContactRow>();
  if (contactIds.length > 0) {
    const { data: contactsData } = await buscaEmLotes(contactIds, (lote) =>
      supabase
        .from("contacts")
        .select("id, name, display_name, phone_number, email")
        .eq("organization_id", activeOrg.orgId)
        .in("id", lote),
    );

    const contatos = (contactsData ?? []) as ContactRow[];
    contactsMap = new Map(contatos.map((c) => [c.id, c]));
  }

  const pipelinesMap = new Map(pipelines.map((p) => [p.id, p.name]));
  const stagesMap = new Map(stages.map((s) => [s.id, s]));

  // 5. Monta itens de produção enriquecidos com semáforo
  const agora = new Date();
  const itens: ItemDeProducao[] = rawLeads.map((l) => {
    const stage = stagesMap.get(l.stage_id);
    const contact = l.contact_id ? contactsMap.get(l.contact_id) : null;
    const prazo = calcularPrazo(l.expected_close_date, agora);

    const stageTipo = stage ? classificarEtapa(stage) : "outro";

    return {
      id: l.id,
      title: l.title,
      description: l.description,
      status: l.status,
      pipeline_id: l.pipeline_id,
      pipeline_name: pipelinesMap.get(l.pipeline_id) ?? "Funil",
      stage_id: l.stage_id,
      stage_name: stage?.name ?? "Etapa",
      stage_color: stage?.color ?? null,
      stage_tipo: stageTipo,
      contact_id: l.contact_id,
      contact_name: contact?.display_name || contact?.name || null,
      contact_phone: contact?.phone_number || null,
      contact_email: contact?.email || null,
      value_cents: l.value_cents,
      currency: l.currency,
      expected_close_date: l.expected_close_date,
      stage_changed_at: l.stage_changed_at,
      created_at: l.created_at,
      updated_at: l.updated_at,
      tags: l.tags ?? [],
      custom_fields: (l.custom_fields as Record<string, unknown>) ?? {},
      prazoStatus: prazo.prazoStatus,
      diasRestantes: prazo.diasRestantes,
      prazoFormatado: prazo.prazoFormatado,
    };
  });

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col p-6">
      <ProducaoClient
        itensIniciais={itens}
        etapas={etapasProducao}
        pipelines={pipelines}
        role={activeOrg.role}
        userLocale={idioma}
      />
    </div>
  );
}
