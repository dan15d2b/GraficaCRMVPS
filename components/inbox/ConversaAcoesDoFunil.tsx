"use client";

import { useMemo, useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClientContext } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown, CheckCircle, ArrowRight, Clock, Warning } from "@/lib/ui/icons";
import { FileText, Sparkles } from "lucide-react";
import { useProvasDaConversa } from "@/hooks/inbox/useProvas";
import { ModalEnviarProva } from "@/components/inbox/ModalEnviarProva";
import { ModalImportarOrcamento } from "@/components/inbox/ModalImportarOrcamento";

interface StageInfo {
  id: string;
  name: string;
  is_won?: boolean;
  is_lost?: boolean;
  position?: number;
}

interface LeadSummary {
  id: string;
  title: string;
  status: string;
  stage_id?: string;
  etapa_nome?: string | null;
  pipeline_id: string;
  etapas_do_funil?: StageInfo[];
}

interface Props {
  contactId: string | null;
  conversationId: string;
}

export function ConversaAcoesDoFunil(props: Props) {
  const qc = useContext(QueryClientContext);
  if (!qc) return null;
  return <ConversaAcoesDoFunilInner {...props} />;
}

function ConversaAcoesDoFunilInner({ contactId, conversationId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [modalProvaAberta, setModalProvaAberta] = useState(false);
  const [modalOrcamentoAberta, setModalOrcamentoAberta] = useState(false);

  const { data: provas } = useProvasDaConversa(conversationId);
  const provaMaisRecente = provas && provas.length > 0 ? provas[0] : null;

  const { data: summary, isLoading } = useQuery({
    queryKey: ["crm-summary", contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const res = await apiClient.get<{
        data: { leads: LeadSummary[] };
      }>(`/api/v1/contacts/${contactId}/crm-summary`);
      return res.data;
    },
    enabled: Boolean(contactId),
    staleTime: 10_000,
  });

  const lead = useMemo(() => {
    if (!summary?.leads || summary.leads.length === 0) return null;
    return summary.leads.find((l) => l.status === "open") ?? summary.leads[0];
  }, [summary]);

  const etapas = lead?.etapas_do_funil ?? [];
  const etapaAtualNome = lead?.etapa_nome ?? "";
  const etapaAtualId = lead?.stage_id;

  const moveMutation = useMutation({
    mutationFn: async ({ leadId, nextStageId }: { leadId: string; nextStageId: string }) => {
      await apiClient.post("/api/v1/leads/bulk", {
        action: "move",
        lead_ids: [leadId],
        params: { stage_id: nextStageId },
      });
    },
    onSuccess: (_, vars) => {
      const targetStage = etapas.find((s) => s.id === vars.nextStageId);
      toast.success(
        `${t("Funil atualizado:")} ${targetStage?.name ?? t("Etapa alterada com sucesso!")}`
      );
      void qc.invalidateQueries({ queryKey: ["crm-summary", contactId] });
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void qc.invalidateQueries({ queryKey: ["crm-side-panel"] });
    },
    onError: (err: any) => {
      console.error("[ConversaAcoesDoFunil] Falha ao mover lead:", err);
      const msg = err?.message || err?.details?.message || t("Não foi possível mover o lead no funil.");
      toast.error(msg);
    },
  });

  const proximasEtapasSugeridas = useMemo(() => {
    if (!lead || etapas.length === 0) return [];

    const norm = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const atual = norm(etapaAtualNome);

    let sugeridas: StageInfo[] = [];

    if (atual.includes("lead") || atual.includes("entrada")) {
      sugeridas = etapas.filter((e) => norm(e.name).includes("orcamento") || norm(e.name).includes("orçamento"));
    } else if (atual.includes("orcamento") || atual.includes("orçamento")) {
      sugeridas = etapas.filter(
        (e) => norm(e.name).includes("acompanhar") || norm(e.name).includes("producao") || norm(e.name).includes("produção")
      );
    } else if (atual.includes("acompanhar")) {
      sugeridas = etapas.filter(
        (e) => norm(e.name).includes("producao") || norm(e.name).includes("produção")
      );
    } else if (atual.includes("producao") || atual.includes("produção")) {
      sugeridas = etapas.filter(
        (e) =>
          norm(e.name).includes("retirada") ||
          norm(e.name).includes("entrega") ||
          norm(e.name).includes("instalacao") ||
          norm(e.name).includes("instalação") ||
          norm(e.name).includes("concluido") ||
          norm(e.name).includes("concluído")
      );
    } else if (atual.includes("retirada") || atual.includes("entrega") || atual.includes("instalacao") || atual.includes("instalação")) {
      sugeridas = etapas.filter(
        (e) => norm(e.name).includes("concluido") || norm(e.name).includes("concluído")
      );
    }

    // Se a regra específica não achou, pega as próximas 2 etapas na ordem
    if (sugeridas.length === 0 && etapaAtualId) {
      const idx = etapas.findIndex((e) => e.id === etapaAtualId);
      if (idx >= 0 && idx < etapas.length - 1) {
        sugeridas = etapas.slice(idx + 1, idx + 3).filter((e) => !e.is_lost);
      }
    }

    return sugeridas.filter((e) => e.id !== etapaAtualId);
  }, [lead, etapas, etapaAtualNome, etapaAtualId]);

  if (isLoading) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Botão de Envio de Prova / Selo de Status da Prova */}
        {provaMaisRecente ? (
          provaMaisRecente.status === "pendente" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setModalProvaAberta(true)}
              className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
              title={t("Clique para ver ou reenviar a prova digital")}
            >
              <Clock size={12} className="mr-1 text-amber-600" aria-hidden />
              <span>
                {t("Prova Pendente")} {provaMaisRecente.os_number ? `(#${provaMaisRecente.os_number})` : ""}
              </span>
            </Button>
          ) : provaMaisRecente.status === "aprovada" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setModalProvaAberta(true)}
              className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
              title={t("Arte aprovada pelo cliente. Clique para enviar nova prova se necessário.")}
            >
              <CheckCircle size={12} className="mr-1 text-emerald-600" aria-hidden />
              <span>
                {t("Arte Aprovada")} {provaMaisRecente.os_number ? `(#${provaMaisRecente.os_number})` : ""}
              </span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setModalProvaAberta(true)}
              className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors"
              title={t("Cliente solicitou ajuste na arte. Clique para enviar nova versão.")}
            >
              <Warning size={12} className="mr-1 text-rose-600" aria-hidden />
              <span>
                {t("Ajuste Solicitado")} {provaMaisRecente.os_number ? `(#${provaMaisRecente.os_number})` : ""}
              </span>
            </Button>
          )
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setModalProvaAberta(true)}
            className="h-7 cursor-pointer rounded-md px-2 text-xs font-medium text-slate-700 bg-surface-elevated/70 hover:bg-muted border-border transition-colors"
            title={t("Enviar prova digital (arte/layout) para aprovação formal do cliente")}
          >
            <FileText className="mr-1 size-3 text-blue-600" aria-hidden />
            <span>{t("Prova Digital")}</span>
          </Button>
        )}

        {/* Botão de Leitura de Orçamento (PDF / Clipboard) */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setModalOrcamentoAberta(true)}
          className="h-7 cursor-pointer rounded-md px-2 text-xs font-medium text-slate-700 bg-surface-elevated/70 hover:bg-muted border-border transition-colors"
          title={t("Importar orçamento em PDF ou texto, calcular prazo em dias úteis e atualizar proposta")}
        >
          <Sparkles className="mr-1 size-3 text-amber-500" aria-hidden />
          <span>{t("Ler Orçamento")}</span>
        </Button>

        {/* Etapas do Funil */}
        {lead && (
          <div className="flex items-center gap-1.5 max-md:hidden">
            {etapaAtualNome && (
              <Badge
                variant="outline"
                className="h-7 border-border/80 bg-surface-elevated/60 px-2.5 text-xs font-semibold text-foreground"
                title={`${t("Etapa atual no Funil:")} ${etapaAtualNome}`}
              >
                <span className="max-w-[130px] truncate">{etapaAtualNome}</span>
              </Badge>
            )}

            {proximasEtapasSugeridas.map((etapa) => (
              <Button
                key={etapa.id}
                type="button"
                size="sm"
                variant="secondary"
                disabled={moveMutation.isPending}
                onClick={() => moveMutation.mutate({ leadId: lead.id, nextStageId: etapa.id })}
                className="h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 hover:text-accent-foreground transition-colors disabled:opacity-50"
                title={`${t("Mover para")} ${etapa.name}`}
              >
                <ArrowRight size={12} className="mr-1" aria-hidden />
                <span className="max-w-[140px] truncate">{etapa.name}</span>
              </Button>
            ))}

            {etapas.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                    title={t("Mover para outra etapa do funil")}
                  >
                    <CaretDown size={13} weight="bold" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {etapas
                    .filter((e) => e.id !== etapaAtualId)
                    .map((e) => (
                      <DropdownMenuItem
                        key={e.id}
                        onClick={() => moveMutation.mutate({ leadId: lead.id, nextStageId: e.id })}
                        className="flex cursor-pointer items-center justify-between text-xs"
                      >
                        <span className="truncate">{e.name}</span>
                        {e.is_won && <CheckCircle size={13} className="text-emerald-500 shrink-0 ml-1" />}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      <ModalEnviarProva
        open={modalProvaAberta}
        onOpenChange={setModalProvaAberta}
        conversationId={conversationId}
        contactId={contactId}
      />

      <ModalImportarOrcamento
        open={modalOrcamentoAberta}
        onOpenChange={setModalOrcamentoAberta}
        conversationId={conversationId}
        contactId={contactId}
      />
    </>
  );
}
