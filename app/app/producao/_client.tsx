"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ClipboardText,
  Warning,
  Clock,
  CheckCircle,
  CalendarBlank,
  CalendarCheck,
  WhatsappLogo,
  ArrowsClockwise,
  MagnifyingGlass,
  Eye,
  Tag,
  ArrowSquareOut,
  Funnel,
  Check,
  X,
  DotsThree,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL } from "@/lib/money";
import { traduzir } from "@/lib/i18n/dicionario";
import { calcularPrazo } from "./prazo";
import type { ItemDeProducao, EtapaProducaoRef, PrazoStatus } from "./types";

interface PipelineOption {
  id: string;
  name: string;
}

interface ProducaoClientProps {
  itensIniciais: ItemDeProducao[];
  etapas: EtapaProducaoRef[];
  pipelines: PipelineOption[];
  role: string;
  userLocale?: "pt-BR" | "es";
}

type FiltroAba =
  | "todos"
  | "atrasado"
  | "urgente"
  | "no_prazo"
  | "sem_prazo"
  | "retirada"
  | "instalacao";

export function ProducaoClient({
  itensIniciais,
  etapas,
  pipelines,
  role,
  userLocale = "pt-BR",
}: ProducaoClientProps) {
  const router = useRouter();
  const [itens, setItens] = useState<ItemDeProducao[]>(itensIniciais);
  const [filtroAba, setFiltroAba] = useState<FiltroAba>("todos");
  const [busca, setBusca] = useState("");
  const [pipelineIdFiltro, setPipelineIdFiltro] = useState<string>("todos");
  const [visualizacao, setVisualizacao] = useState<"cards" | "tabela">("cards");
  const [ordenacao, setOrdenacao] = useState<"urgente" | "valor" | "recentes">("urgente");
  const [itemDossie, setItemDossie] = useState<ItemDeProducao | null>(null);
  const [editandoPrazoId, setEditandoPrazoId] = useState<string | null>(null);
  const [novaDataPrazo, setNovaDataPrazo] = useState<string>("");
  const [acaoCarregandoId, setAcaoCarregandoId] = useState<string | null>(null);

  const t = (texto: string) => traduzir(texto, userLocale);

  // ─── MÉTRICAS AGREGADAS ──────────────────────────────────────────────────────
  const metricas = useMemo(() => {
    let totalAtrasados = 0;
    let totalHojeAmanha = 0;
    let totalNoPrazo = 0;
    let totalSemPrazo = 0;
    let totalProntoRetirada = 0;
    let totalProntoInstalacao = 0;
    let totalEmProducao = 0;
    let valorTotalCents = 0;

    for (const item of itens) {
      if (item.stage_tipo === "producao") totalEmProducao++;
      if (item.stage_tipo === "retirada") totalProntoRetirada++;
      if (item.stage_tipo === "instalacao") totalProntoInstalacao++;

      if (item.prazoStatus === "atrasado") totalAtrasados++;
      else if (item.prazoStatus === "hoje" || item.prazoStatus === "amanha") totalHojeAmanha++;
      else if (item.prazoStatus === "no_prazo") totalNoPrazo++;
      else if (item.prazoStatus === "sem_prazo") totalSemPrazo++;

      if (item.value_cents) valorTotalCents += item.value_cents;
    }

    return {
      totalGeral: itens.length,
      totalEmProducao,
      totalAtrasados,
      totalHojeAmanha,
      totalNoPrazo,
      totalSemPrazo,
      totalProntoRetirada,
      totalProntoInstalacao,
      valorTotalCents,
    };
  }, [itens]);

  // ─── FILTRO & ORDENAÇÃO DOS ITENS ───────────────────────────────────────────
  const itensFiltrados = useMemo(() => {
    let resultado = [...itens];

    // Filtro por funil
    if (pipelineIdFiltro !== "todos") {
      resultado = resultado.filter((i) => i.pipeline_id === pipelineIdFiltro);
    }

    // Filtro por aba
    if (filtroAba === "atrasado") {
      resultado = resultado.filter((i) => i.prazoStatus === "atrasado");
    } else if (filtroAba === "urgente") {
      resultado = resultado.filter(
        (i) => i.prazoStatus === "hoje" || i.prazoStatus === "amanha",
      );
    } else if (filtroAba === "no_prazo") {
      resultado = resultado.filter((i) => i.prazoStatus === "no_prazo");
    } else if (filtroAba === "sem_prazo") {
      resultado = resultado.filter((i) => i.prazoStatus === "sem_prazo");
    } else if (filtroAba === "retirada") {
      resultado = resultado.filter((i) => i.stage_tipo === "retirada");
    } else if (filtroAba === "instalacao") {
      resultado = resultado.filter((i) => i.stage_tipo === "instalacao");
    }

    // Filtro por busca
    if (busca.trim()) {
      const q = busca.toLowerCase();
      resultado = resultado.filter((i) => {
        const titleMatch = i.title.toLowerCase().includes(q);
        const contactMatch =
          i.contact_name?.toLowerCase().includes(q) ||
          i.contact_phone?.toLowerCase().includes(q);
        const tagsMatch = i.tags.some((t) => t.toLowerCase().includes(q));
        const stageMatch = i.stage_name.toLowerCase().includes(q);
        return titleMatch || contactMatch || tagsMatch || stageMatch;
      });
    }

    // Ordenação
    resultado.sort((a, b) => {
      if (ordenacao === "urgente") {
        // Atrasados primeiro (menor diasRestantes), depois hoje/amanhã, depois no_prazo, sem_prazo por último
        const ordemPeso: Record<PrazoStatus, number> = {
          atrasado: 1,
          hoje: 2,
          amanha: 3,
          no_prazo: 4,
          sem_prazo: 5,
        };
        const pesoA = ordemPeso[a.prazoStatus];
        const pesoB = ordemPeso[b.prazoStatus];
        if (pesoA !== pesoB) return pesoA - pesoB;
        if (a.diasRestantes !== null && b.diasRestantes !== null) {
          return a.diasRestantes - b.diasRestantes;
        }
        return 0;
      }
      if (ordenacao === "valor") {
        return (b.value_cents ?? 0) - (a.value_cents ?? 0);
      }
      if (ordenacao === "recentes") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });

    return resultado;
  }, [itens, pipelineIdFiltro, filtroAba, busca, ordenacao]);

  // ─── AÇÕES 1-CLICK: MOVER ETAPA ────────────────────────────────────────────
  async function moverParaEtapa(
    item: ItemDeProducao,
    destinoTipo: "retirada" | "instalacao" | "concluido",
  ) {
    setAcaoCarregandoId(item.id);
    try {
      if (destinoTipo === "concluido") {
        // Tenta encontrar etapa de concluído/ganho do funil
        const etapaConcluido = etapas.find(
          (e) => e.pipeline_id === item.pipeline_id && (e.tipo === "concluido" || e.is_won),
        );

        if (etapaConcluido) {
          await apiClient.post(`/api/v1/leads/${item.id}/move`, {
            stage_id: etapaConcluido.id,
            position_in_stage: 0,
            expected_updated_at: item.updated_at,
          });
        } else {
          // Se não houver etapa explícita de concluído, encerra como ganho via endpoint canônico
          await apiClient.post(`/api/v1/leads/${item.id}/win`, {});
        }

        // Remove da fila de produção ativa instantaneamente
        setItens((prev) => prev.filter((i) => i.id !== item.id));
        toast.success(`Pedido #${item.id.slice(0, 7)} concluído com sucesso!`);
        return;
      }

      // Localiza a etapa correspondente no mesmo funil
      const etapaDestino = etapas.find(
        (e) => e.pipeline_id === item.pipeline_id && e.tipo === destinoTipo,
      );

      if (!etapaDestino) {
        toast.error(
          `Nenhuma etapa de ${destinoTipo === "retirada" ? "Retirada" : "Instalação"} encontrada neste funil.`,
        );
        return;
      }

      await apiClient.post(`/api/v1/leads/${item.id}/move`, {
        stage_id: etapaDestino.id,
        position_in_stage: 0,
        expected_updated_at: item.updated_at,
      });

      // Atualiza estado local de forma reativa e instantânea
      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                stage_id: etapaDestino.id,
                stage_name: etapaDestino.name,
                stage_tipo: destinoTipo,
                updated_at: new Date().toISOString(),
              }
            : i,
        ),
      );

      if (destinoTipo === "retirada") {
        toast.success(
          `Pedido movido para "${etapaDestino.name}". Notificação de retirada pronta no WhatsApp será disparada!`,
        );
      } else {
        toast.success(`Pedido movido para "${etapaDestino.name}" com sucesso.`);
      }
    } catch (err) {
      toast.error("Não foi possível mover o pedido. Tente novamente.");
    } finally {
      setAcaoCarregandoId(null);
    }
  }

  // ─── AÇÃO: AJUSTAR PRAZO DE ENTREGA ─────────────────────────────────────────
  async function salvarNovoPrazo(item: ItemDeProducao) {
    if (!novaDataPrazo) {
      toast.error("Selecione uma data válida.");
      return;
    }

    setAcaoCarregandoId(item.id);
    try {
      await apiClient.patch(`/api/v1/leads/${item.id}`, {
        expected_close_date: novaDataPrazo,
      });

      const novoPrazo = calcularPrazo(novaDataPrazo);

      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                expected_close_date: novaDataPrazo,
                prazoStatus: novoPrazo.prazoStatus,
                diasRestantes: novoPrazo.diasRestantes,
                prazoFormatado: novoPrazo.prazoFormatado,
                updated_at: new Date().toISOString(),
              }
            : i,
        ),
      );

      toast.success(`Prazo de entrega atualizado para ${novoPrazo.prazoFormatado}!`);
      setEditandoPrazoId(null);
      setNovaDataPrazo("");
    } catch (err) {
      toast.error("Falha ao atualizar prazo.");
    } finally {
      setAcaoCarregandoId(null);
    }
  }

  // ─── RENDER DE BADGE SEMAFÓRICO ─────────────────────────────────────────────
  function renderBadgePrazo(item: ItemDeProducao) {
    switch (item.prazoStatus) {
      case "atrasado":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
            <Warning size={14} weight="fill" className="animate-pulse text-red-500" />
            <span>
              Atrasado há {Math.abs(item.diasRestantes ?? 0)}{" "}
              {Math.abs(item.diasRestantes ?? 0) === 1 ? "dia" : "dias"}
            </span>
            <span className="font-mono text-[11px] opacity-75">({item.prazoFormatado})</span>
          </span>
        );
      case "hoje":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Clock size={14} weight="fill" className="text-amber-500" />
            <span>Entrega Hoje</span>
            <span className="font-mono text-[11px] opacity-75">({item.prazoFormatado})</span>
          </span>
        );
      case "amanha":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
            <Clock size={14} weight="bold" />
            <span>Entrega Amanhã</span>
            <span className="font-mono text-[11px] opacity-75">({item.prazoFormatado})</span>
          </span>
        );
      case "no_prazo":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle size={14} weight="bold" />
            <span>Em {item.diasRestantes} dias</span>
            <span className="font-mono text-[11px] opacity-75">({item.prazoFormatado})</span>
          </span>
        );
      case "sem_prazo":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
            <CalendarBlank size={13} />
            <span>Sem prazo</span>
          </span>
        );
    }
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* ─── TOPO / CABEÇALHO ────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-md bg-accent/10 text-accent">
              <ClipboardText size={22} weight="duotone" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Controle de Produção</h1>
              <p className="text-xs text-muted-foreground">
                Fila de impressão, semáforo de prazos de entrega e expedição de ordens de serviço
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pipelines.length > 1 && (
            <select
              value={pipelineIdFiltro}
              onChange={(e) => setPipelineIdFiltro(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="todos">Todos os Funis</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="gap-1.5 text-xs"
          >
            <ArrowsClockwise size={15} />
            Atualizar
          </Button>

          <Link href="/app/kanban">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Funnel size={15} />
              Quadro Kanban
            </Button>
          </Link>
        </div>
      </header>

      {/* ─── KPI CARDS (PAINEL DE CONTROLE) ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total em Produção */}
        <div
          onClick={() => setFiltroAba("todos")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "todos"
              ? "border-accent bg-accent/5 ring-1 ring-accent"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Em Produção</span>
            <ClipboardText size={16} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight">
              {metricas.totalEmProducao}
            </span>
            <span className="text-[11px] text-muted-foreground">ativos</span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-accent">
            {formatCentsBRL(metricas.valorTotalCents)}
          </div>
        </div>

        {/* Atrasados */}
        <div
          onClick={() => setFiltroAba("atrasado")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "atrasado"
              ? "border-red-500 bg-red-500/10 ring-1 ring-red-500"
              : "border-red-500/30 bg-red-500/5 hover:border-red-500/60"
          }`}
        >
          <div className="flex items-center justify-between text-red-600 dark:text-red-400">
            <span className="text-xs font-bold">Atrasados</span>
            <Warning size={16} weight="fill" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {metricas.totalAtrasados}
            </span>
            <span className="text-[11px] text-red-600/80 dark:text-red-400/80">pedidos</span>
          </div>
          <div className="mt-1 text-[11px] text-red-600/90 dark:text-red-400/90 font-medium">
            Atenção imediata
          </div>
        </div>

        {/* Hoje / Amanhã */}
        <div
          onClick={() => setFiltroAba("urgente")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "urgente"
              ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500"
              : "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60"
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-xs font-bold">Hoje & Amanhã</span>
            <Clock size={16} weight="fill" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {metricas.totalHojeAmanha}
            </span>
            <span className="text-[11px] text-amber-600/80 dark:text-amber-400/80">entregas</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-600/90 dark:text-amber-400/90 font-medium">
            Prioridade de fábrica
          </div>
        </div>

        {/* No Prazo */}
        <div
          onClick={() => setFiltroAba("no_prazo")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "no_prazo"
              ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-medium">No Prazo</span>
            <CheckCircle size={16} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {metricas.totalNoPrazo}
            </span>
            <span className="text-[11px] text-muted-foreground">no cronograma</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-medium">Fluxo normal</div>
        </div>

        {/* Pronto para Retirada */}
        <div
          onClick={() => setFiltroAba("retirada")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "retirada"
              ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
            <span className="text-xs font-medium">Balcão / Retirada</span>
            <CalendarCheck size={16} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {metricas.totalProntoRetirada}
            </span>
            <span className="text-[11px] text-muted-foreground">aguardando</span>
          </div>
          <div className="mt-1 text-[11px] text-blue-600/90 dark:text-blue-400/90 font-medium">
            Notificado via WhatsApp
          </div>
        </div>

        {/* Pronto para Instalação */}
        <div
          onClick={() => setFiltroAba("instalacao")}
          className={`cursor-pointer rounded-lg border p-3 transition-all ${
            filtroAba === "instalacao"
              ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-xs font-medium">Instalação / Entrega</span>
            <CalendarBlank size={16} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
              {metricas.totalProntoInstalacao}
            </span>
            <span className="text-[11px] text-muted-foreground">prontos</span>
          </div>
          <div className="mt-1 text-[11px] text-indigo-600/90 dark:text-indigo-400/90 font-medium">
            Rota de equipe
          </div>
        </div>
      </div>

      {/* ─── BARRA DE FERRAMENTAS & FILTROS ─────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Abas de filtro */}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={filtroAba === "todos" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("todos")}
            className="h-8 text-xs font-medium"
          >
            Todos ({metricas.totalGeral})
          </Button>

          <Button
            variant={filtroAba === "atrasado" ? "destructive" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("atrasado")}
            className="h-8 gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <Warning size={14} weight="fill" />
            Atrasados ({metricas.totalAtrasados})
          </Button>

          <Button
            variant={filtroAba === "urgente" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("urgente")}
            className="h-8 gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            <Clock size={14} weight="fill" />
            Hoje & Amanhã ({metricas.totalHojeAmanha})
          </Button>

          <Button
            variant={filtroAba === "no_prazo" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("no_prazo")}
            className="h-8 gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle size={14} />
            No Prazo ({metricas.totalNoPrazo})
          </Button>

          <Button
            variant={filtroAba === "retirada" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("retirada")}
            className="h-8 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Balcão / Retirada ({metricas.totalProntoRetirada})
          </Button>

          <Button
            variant={filtroAba === "instalacao" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFiltroAba("instalacao")}
            className="h-8 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            Instalação ({metricas.totalProntoInstalacao})
          </Button>

          {metricas.totalSemPrazo > 0 && (
            <Button
              variant={filtroAba === "sem_prazo" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFiltroAba("sem_prazo")}
              className="h-8 text-xs font-medium text-muted-foreground"
            >
              Sem Prazo ({metricas.totalSemPrazo})
            </Button>
          )}
        </div>

        {/* Busca e ordenação */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, OS, material..."
              className="h-8 pl-8 text-xs"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as "urgente" | "valor" | "recentes")}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
          >
            <option value="urgente">Ordenar por: Mais urgentes</option>
            <option value="valor">Ordenar por: Maior valor</option>
            <option value="recentes">Ordenar por: Mais recentes</option>
          </select>
        </div>
      </div>

      {/* ─── LISTA / GRID DE ORDENS DE PRODUÇÃO ─────────────────────────── */}
      {itensFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
          <ClipboardText size={40} className="text-muted-foreground/50" />
          <h3 className="mt-3 text-base font-semibold">Nenhuma ordem de produção encontrada</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {busca
              ? "Nenhum resultado corresponde aos termos da pesquisa."
              : "Não há pedidos ativos nas etapas de produção correspondentes a este filtro."}
          </p>
          {busca && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBusca("")}
              className="mt-4 text-xs"
            >
              Limpar busca
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {itensFiltrados.map((item) => {
            const ehEmProducao = item.stage_tipo === "producao";
            const ehRetirada = item.stage_tipo === "retirada";
            const ehInstalacao = item.stage_tipo === "instalacao";

            // Extrai dados técnicos customizados do dossiê
            const cf = item.custom_fields || {};
            const material = (cf.material as string) || (cf.substrato as string) || null;
            const dimensoes = (cf.dimensoes as string) || (cf.medidas as string) || null;
            const acabamento = (cf.acabamento as string) || null;

            // Link do WhatsApp
            const telLimpo = (item.contact_phone || "").replace(/\D/g, "");
            const whatsappUrl = telLimpo
              ? `https://wa.me/${telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`}?text=${encodeURIComponent(
                  `Olá ${item.contact_name || ""}, tudo bem? Sobre o seu pedido "${item.title}" na GráficaCRM:`,
                )}`
              : null;

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-md ${
                  ehRetirada
                    ? "border-emerald-300/80 bg-emerald-50/20 dark:border-emerald-900/60 dark:bg-emerald-950/10 hover:border-emerald-500 shadow-xs"
                    : ehInstalacao
                      ? "border-indigo-300/80 bg-indigo-50/20 dark:border-indigo-900/60 dark:bg-indigo-950/10 hover:border-indigo-500 shadow-xs"
                      : "border-border/90 bg-card hover:border-primary/50 shadow-xs"
                }`}
              >
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-muted-foreground">
                          #{item.id.slice(0, 7)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold py-0.5 px-2 ${
                            ehRetirada
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : ehInstalacao
                                ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                                : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {item.stage_name}
                        </Badge>
                      </div>
                      <h3
                        className="mt-1.5 text-base font-bold tracking-tight text-foreground line-clamp-1"
                        title={item.title}
                      >
                        {item.title}
                      </h3>
                    </div>

                    <div className="shrink-0">{renderBadgePrazo(item)}</div>
                  </div>

                  {/* Informações do Cliente */}
                  <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                    <div className="truncate">
                      <span className="font-semibold text-foreground">
                        {item.contact_name || "Cliente sem contato"}
                      </span>
                      {item.contact_phone && (
                        <span className="ml-1.5 font-mono text-xs text-foreground/70">
                          ({item.contact_phone})
                        </span>
                      )}
                    </div>
                    {item.value_cents ? (
                      <span className="font-mono font-bold text-sm text-foreground">
                        {formatCentsBRL(item.value_cents)}
                      </span>
                    ) : null}
                  </div>

                  {/* Dossiê Técnico Rápido (Material, Dimensões, Acabamento) */}
                  {(material || dimensoes || acabamento) && (
                    <div className="mt-3 rounded-lg bg-muted/60 border border-border/60 p-2.5 text-xs text-foreground/90 space-y-1">
                      {material && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-foreground">Material:</span>
                          <span className="truncate">{material}</span>
                        </div>
                      )}
                      {dimensoes && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-foreground">Dimensões:</span>
                          <span className="font-mono font-medium">{dimensoes}</span>
                        </div>
                      )}
                      {acabamento && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-foreground">Acabamento:</span>
                          <span className="truncate">{acabamento}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {item.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80 border border-border/50"
                        >
                          <Tag size={11} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ─── AÇÕES RÁPIDAS NO CHÃO DE FÁBRICA (1-CLICK) ───────────── */}
                <div className="mt-4 border-t border-border/70 pt-3">
                  {/* Se estiver editando prazo inline */}
                  {editandoPrazoId === item.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={novaDataPrazo}
                        onChange={(e) => setNovaDataPrazo(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={acaoCarregandoId === item.id}
                        onClick={() => salvarNovoPrazo(item)}
                        className="h-8 px-3 text-xs font-semibold cursor-pointer"
                      >
                        <Check size={14} weight="bold" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditandoPrazoId(null)}
                        className="h-8 px-2.5 text-xs cursor-pointer"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        {/* 1-Click: Mover para Pronto para Retirada */}
                        {ehEmProducao && (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={acaoCarregandoId === item.id}
                            onClick={() => moverParaEtapa(item, "retirada")}
                            className="h-8 flex-1 gap-1 text-xs font-semibold cursor-pointer"
                          >
                            <CalendarCheck size={14} weight="bold" />
                            Pronto p/ Retirada
                          </Button>
                        )}

                        {/* 1-Click: Mover para Pronto para Instalação */}
                        {ehEmProducao && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={acaoCarregandoId === item.id}
                            onClick={() => moverParaEtapa(item, "instalacao")}
                            className="h-8 flex-1 gap-1 text-xs font-semibold cursor-pointer"
                          >
                            <CalendarBlank size={14} weight="bold" />
                            Pronto p/ Instalação
                          </Button>
                        )}

                        {/* 1-Click: Concluir direto de Em Produção */}
                        {ehEmProducao && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acaoCarregandoId === item.id}
                            onClick={() => moverParaEtapa(item, "concluido")}
                            className="h-8 gap-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 cursor-pointer"
                            title="Concluir pedido"
                          >
                            <Check size={14} weight="bold" />
                            Concluir
                          </Button>
                        )}

                        {/* Se já estiver em retirada, status + Botão Concluído */}
                        {ehRetirada && (
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                              ✓ Aguardando cliente no balcão
                            </span>
                            <Button
                              size="sm"
                              disabled={acaoCarregandoId === item.id}
                              onClick={() => moverParaEtapa(item, "concluido")}
                              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 shadow-xs cursor-pointer"
                            >
                              <Check size={15} weight="bold" />
                              Concluído
                            </Button>
                          </div>
                        )}

                        {/* Se já estiver em instalação, status + Botão Concluído */}
                        {ehInstalacao && (
                          <div className="flex flex-1 items-center justify-between gap-2">
                            <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                              ✓ Pronto para rota de instalação
                            </span>
                            <Button
                              size="sm"
                              disabled={acaoCarregandoId === item.id}
                              onClick={() => moverParaEtapa(item, "concluido")}
                              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 shadow-xs cursor-pointer"
                            >
                              <Check size={15} weight="bold" />
                              Concluído
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Botões secundários: WhatsApp, Ajustar Prazo, Dossiê */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <div className="flex items-center gap-3">
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                              title="Abrir conversa no WhatsApp"
                            >
                              <WhatsappLogo size={14} weight="fill" />
                              <span className="text-xs">WhatsApp</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditandoPrazoId(item.id);
                              setNovaDataPrazo(
                                item.expected_close_date
                                  ? item.expected_close_date.split("T")[0]!
                                  : "",
                              );
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors cursor-pointer"
                            title="Ajustar prazo de entrega"
                          >
                            <Clock size={13} />
                            Prazo
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setItemDossie(item)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                          >
                            <Eye size={13} />
                            Dossiê
                          </button>

                          <Link
                            href={`/app/pipelines/${item.pipeline_id}?lead=${item.id}`}
                            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Ver negócio no quadro Kanban"
                          >
                            <ArrowSquareOut size={13} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL DO DOSSIÊ TÉCNICO COMPLETO ────────────────────────────── */}
      <Dialog open={!!itemDossie} onOpenChange={(open) => !open && setItemDossie(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {itemDossie?.stage_name}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                #{itemDossie?.id.slice(0, 8)}
              </span>
            </div>
            <DialogTitle className="text-lg font-bold">{itemDossie?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              Especificações técnicas e briefing gerado para produção
            </DialogDescription>
          </DialogHeader>

          {itemDossie && (
            <div className="flex flex-col gap-3 py-2 text-xs">
              {/* Cliente */}
              <div className="rounded-md border border-border p-3">
                <span className="font-semibold text-foreground">Dados do Cliente</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    <span className="block text-[11px]">Nome:</span>
                    <span className="font-medium text-foreground">
                      {itemDossie.contact_name || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px]">Telefone:</span>
                    <span className="font-mono font-medium text-foreground">
                      {itemDossie.contact_phone || "Não informado"}
                    </span>
                  </div>
                  {itemDossie.contact_email && (
                    <div className="col-span-2">
                      <span className="block text-[11px]">E-mail:</span>
                      <span className="font-mono text-foreground">{itemDossie.contact_email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prazo e Valor */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border p-3">
                  <span className="block text-[11px] text-muted-foreground">Prazo de Entrega:</span>
                  <div className="mt-1">{renderBadgePrazo(itemDossie)}</div>
                </div>

                <div className="rounded-md border border-border p-3">
                  <span className="block text-[11px] text-muted-foreground">Valor Total:</span>
                  <span className="mt-1 block font-mono text-base font-bold text-foreground">
                    {itemDossie.value_cents ? formatCentsBRL(itemDossie.value_cents) : "R$ 0,00"}
                  </span>
                </div>
              </div>

              {/* Especificações Técnicas (Custom Fields) */}
              <div className="rounded-md border border-border p-3">
                <span className="font-semibold text-foreground">Especificações Técnicas</span>
                <div className="mt-2 space-y-1.5">
                  {Object.entries(itemDossie.custom_fields).length > 0 ? (
                    Object.entries(itemDossie.custom_fields).map(([chave, val]) => (
                      <div key={chave} className="flex justify-between border-b border-border/40 pb-1">
                        <span className="capitalize text-muted-foreground">
                          {chave.replace(/_/g, " ")}:
                        </span>
                        <span className="font-medium text-foreground">
                          {typeof val === "object" ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Nenhum campo personalizado registrado.</p>
                  )}
                </div>
              </div>

              {/* Descrição / Observações */}
              {itemDossie.description && (
                <div className="rounded-md border border-border p-3">
                  <span className="font-semibold text-foreground">Observações / Dossiê do Briefing</span>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {itemDossie.description}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {itemDossie && (
              <Link href={`/app/pipelines/${itemDossie.pipeline_id}?lead=${itemDossie.id}`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ArrowSquareOut size={14} />
                  Abrir no Kanban
                </Button>
              </Link>
            )}
            <Button variant="secondary" size="sm" onClick={() => setItemDossie(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
