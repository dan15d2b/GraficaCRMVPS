import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { buscaEmLotes } from "@/lib/supabase/em-lotes";
import {
  calcularMetricasFinanceiras,
  type LeadFinanceiro,
} from "@/lib/financeiro/metricas";
import { FinanceiroClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard Financeira",
  description: "Faturamento, comparativo mensal, ticket médio e projeção de receita",
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

export default async function FinanceiroPage() {
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

  // 2. Etapas de todos os funis ativos
  const { data: stagesData } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, name, slug, position, color, is_won, is_lost")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const stages = (stagesData ?? []) as StageRow[];
  const stagesMap = new Map(stages.map((s) => [s.id, s]));

  // 3. Busca de todos os leads com valor ou fechados
  const { data: leadsData } = await supabase
    .from("crm_leads")
    .select("id, title, value_cents, currency, stage_id, pipeline_id, contact_id, status, expected_close_date, created_at, updated_at, stage_changed_at, custom_fields")
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  const rawLeads = leadsData ?? [];

  // 4. Carrega contatos vinculados
  const contactIds = [
    ...new Set(
      rawLeads.map((l) => l.contact_id).filter((c): c is string => typeof c === "string" && !!c)
    ),
  ];

  let contactsMap = new Map<string, ContactRow>();
  if (contactIds.length > 0) {
    const { data: contactsData } = await buscaEmLotes(contactIds, (lote) =>
      supabase
        .from("contacts")
        .select("id, name, display_name, phone_number, email")
        .eq("organization_id", activeOrg.orgId)
        .in("id", lote)
    );
    const contatos = (contactsData ?? []) as ContactRow[];
    contactsMap = new Map(contatos.map((c) => [c.id, c]));
  }

  // 5. Monta leads enriquecidos
  const leadsFinanceiros: LeadFinanceiro[] = rawLeads.map((l) => {
    const stage = stagesMap.get(l.stage_id);
    const contact = l.contact_id ? contactsMap.get(l.contact_id) : null;

    const isWon = stage?.is_won ?? l.status === "won";
    const isLost = stage?.is_lost ?? l.status === "lost";
    const stageName = stage?.name ?? "";
    const isProducao = /produção|retirada|instalação/i.test(stageName);
    const isProposta = /proposta|orçamento|briefing|atendimento/i.test(stageName);

    return {
      id: l.id,
      title: l.title,
      value_cents: l.value_cents,
      currency: l.currency ?? "BRL",
      stage_id: l.stage_id,
      stage_name: stageName,
      stage_slug: stage?.slug,
      is_won: isWon,
      is_lost: isLost,
      is_producao: isProducao,
      is_proposta: isProposta,
      status: l.status,
      expected_close_date: l.expected_close_date,
      created_at: l.created_at,
      updated_at: l.updated_at,
      stage_changed_at: l.stage_changed_at,
      contact_id: l.contact_id,
      contact_name: contact?.display_name || contact?.name || null,
      contact_phone: contact?.phone_number || null,
      custom_fields: l.custom_fields as Record<string, unknown> | null,
    };
  });

  // 6. Calcula métricas consolidadas
  const metricas = calcularMetricasFinanceiras(leadsFinanceiros, new Date());

  return (
    <div className="flex h-full flex-col p-6 space-y-6">
      <FinanceiroClient
        metricasIniciais={metricas}
        leads={leadsFinanceiros}
        orgName={activeOrg.name}
      />
    </div>
  );
}
