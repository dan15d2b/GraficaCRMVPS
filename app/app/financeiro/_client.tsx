"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  CurrencyDollar,
  TrendUp,
  TrendDown,
  Package,
  FileText,
  CheckCircle,
  ArrowClockwise,
  ChartLineUp,
  Tag,
  CalendarCheck,
  ShieldCheck,
  RocketLaunch,
  Scales,
} from "@phosphor-icons/react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type MetricasFinanceirasResumo,
  type LeadFinanceiro,
  calcularMetricasFinanceiras,
} from "@/lib/financeiro/metricas";

interface FinanceiroClientProps {
  metricasIniciais: MetricasFinanceirasResumo;
  leads: LeadFinanceiro[];
  orgName?: string;
}

function formatarBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function FinanceiroClient({
  metricasIniciais,
  leads,
  orgName,
}: FinanceiroClientProps) {
  const [periodoFiltro, setPeriodoFiltro] = useState<string>("mes_atual");
  const [metricas, setMetricas] = useState<MetricasFinanceirasResumo>(metricasIniciais);
  const [recarregando, setRecarregando] = useState(false);

  const atualizarMetricas = () => {
    setRecarregando(true);
    setTimeout(() => {
      setMetricas(calcularMetricasFinanceiras(leads, new Date()));
      setRecarregando(false);
    }, 300);
  };

  // Dados para o Gráfico 1: Comparativo Mensal
  const dadosGraficoMensal = useMemo(() => {
    return metricas.comparativoMensal.map((m) => ({
      name: m.rotulo,
      "Faturado (R$)": Math.round(m.faturadoCents / 100),
      "Em Produção (R$)": Math.round(m.producaoCents / 100),
      "Meta Prevista (R$)": Math.round(m.metaCents / 100),
    }));
  }, [metricas.comparativoMensal]);

  // Dados para o Gráfico 2: Ritmo Diário
  const dadosGraficoDiario = useMemo(() => {
    return metricas.ritmoDiario.map((d) => ({
      name: d.diaFormatado,
      "Acumulado (R$)": Math.round(d.acumuladoCents / 100),
      "Ritmo Projetado (R$)": Math.round(d.projecaoCents / 100),
    }));
  }, [metricas.ritmoDiario]);

  return (
    <div className="flex flex-col gap-6">
      {/* ─── TOPO & FILTROS ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard Financeira
            </h1>
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400">
              Tempo Real
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orgName ? `Gestão de receitas e ordens de serviço de ${orgName}` : "Faturamento, comparativo entre meses e projeções de receita."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
            <SelectTrigger className="w-[180px] h-9 text-xs font-semibold">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_atual">Mês Atual</SelectItem>
              <SelectItem value="ultimos_3_meses">Últimos 3 Meses</SelectItem>
              <SelectItem value="ultimos_6_meses">Últimos 6 Meses</SelectItem>
              <SelectItem value="ano_atual">Ano Atual (2026)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={atualizarMetricas}
            disabled={recarregando}
            className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <ArrowClockwise size={14} className={recarregando ? "animate-spin" : ""} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ─── CARDS DE KPI PRINCIPAIS ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Faturamento Concluído */}
        <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 to-emerald-100/20 dark:border-emerald-900/60 dark:from-emerald-950/20 dark:to-transparent shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Faturado no Mês
            </CardTitle>
            <CheckCircle size={20} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-950 dark:text-emerald-50">
              {formatarBRL(metricas.faturamentoMesAtualCents)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              {metricas.variacaoMoMPercent >= 0 ? (
                <span className="flex items-center font-bold text-emerald-600 dark:text-emerald-400">
                  <TrendUp size={14} weight="bold" className="mr-0.5" />
                  +{metricas.variacaoMoMPercent}%
                </span>
              ) : (
                <span className="flex items-center font-bold text-rose-600 dark:text-rose-400">
                  <TrendDown size={14} weight="bold" className="mr-0.5" />
                  {metricas.variacaoMoMPercent}%
                </span>
              )}
              <span className="text-muted-foreground font-medium">vs mês anterior</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {metricas.pedidosFechadosMesAtualCount} pedidos concluídos no mês
            </p>
          </CardContent>
        </Card>

        {/* 2. Em Produção (Receita Comprometida) */}
        <Card className="border-blue-200/80 bg-gradient-to-br from-blue-50/50 to-blue-100/20 dark:border-blue-900/60 dark:from-blue-950/20 dark:to-transparent shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Em Produção
            </CardTitle>
            <Package size={20} weight="fill" className="text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-blue-950 dark:text-blue-50">
              {formatarBRL(metricas.emProducaoCents)}
            </div>
            <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              Receita aprovada na fábrica
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {metricas.emProducaoCount} ordens de serviço ativas
            </p>
          </CardContent>
        </Card>

        {/* 3. Propostas em Negociação */}
        <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/50 to-amber-100/20 dark:border-amber-900/60 dark:from-amber-950/20 dark:to-transparent shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Orçamentos Abertos
            </CardTitle>
            <FileText size={20} weight="fill" className="text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-950 dark:text-amber-50">
              {formatarBRL(metricas.propostasAbertasCents)}
            </div>
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Pipeline de orçamentos enviados
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {metricas.propostasAbertasCount} propostas em negociação
            </p>
          </CardContent>
        </Card>

        {/* 4. Ticket Médio */}
        <Card className="border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 to-indigo-100/20 dark:border-indigo-900/60 dark:from-indigo-950/20 dark:to-transparent shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
              Ticket Médio
            </CardTitle>
            <CurrencyDollar size={20} weight="fill" className="text-indigo-600 dark:text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-950 dark:text-indigo-50">
              {formatarBRL(metricas.ticketMedioCents)}
            </div>
            <p className="mt-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Média por pedido fechado
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Baseado nas ordens ativas e concluídas
            </p>
          </CardContent>
        </Card>

        {/* 5. Projeção Próximo Mês */}
        <Card className="border-purple-200/80 bg-gradient-to-br from-purple-50/50 to-purple-100/20 dark:border-purple-900/60 dark:from-purple-950/20 dark:to-transparent shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Projeção Próx. Mês
            </CardTitle>
            <ChartLineUp size={20} weight="fill" className="text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-950 dark:text-purple-50">
              {formatarBRL(metricas.projecaoProximoMesCents)}
            </div>
            <p className="mt-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              Cenário Realista (Run-rate + 35% conv.)
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Conservador: {formatarBRL(metricas.projecaoConservadoraCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── SEÇÃO DE GRÁFICOS PRINCIPAIS ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gráfico 1: Comparativo Mensal */}
        <Card className="shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  Comparativo de Faturamento Mensal (Últimos 6 Meses)
                </CardTitle>
                <CardDescription className="text-xs">
                  Evolução do faturamento concluído vs ordens em produção e metas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosGraficoMensal} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(val) => [`R$ ${Number(val).toLocaleString("pt-BR")},00`, ""]}
                    contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid #e2e8f0" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                  <Bar dataKey="Faturado (R$)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Em Produção (R$)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Ritmo Diário Acumulado */}
        <Card className="shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  Curva de Ritmo Diário no Mês Atual
                </CardTitle>
                <CardDescription className="text-xs">
                  Faturamento acumulado dia a dia vs ritmo projetado para o mês
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosGraficoDiario} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="corFaturamento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(val) => [`R$ ${Number(val).toLocaleString("pt-BR")},00`, ""]}
                    contentStyle={{ borderRadius: "8px", fontSize: "12px", border: "1px solid #e2e8f0" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                  <Area
                    type="monotone"
                    dataKey="Acumulado (R$)"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#corFaturamento)"
                  />
                  <Line
                    type="monotone"
                    dataKey="Ritmo Projetado (R$)"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── SEÇÃO DE CENÁRIOS DE PROJEÇÃO & CATEGORIAS DE MATERIAIS ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Projeção de 3 Cenários para o Próximo Mês */}
        <Card className="lg:col-span-1 shadow-xs border-purple-200/80 dark:border-purple-900/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ChartLineUp size={20} weight="bold" className="text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-base font-bold">Projeção para o Próximo Mês</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Estimativa baseada no ritmo diário de produção e conversão de orçamentos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cenário Conservador */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck size={16} weight="fill" className="text-slate-500" />
                  Cenário Conservador
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {formatarBRL(metricas.projecaoConservadoraCents)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Considera apenas a carteira recorrente e base fixa histórica sem novos orçamentos.
              </p>
            </div>

            {/* Cenário Realista */}
            <div className="rounded-lg border-2 border-purple-300 bg-purple-50/70 p-3.5 dark:border-purple-800 dark:bg-purple-950/40">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-purple-900 dark:text-purple-200">
                  <Scales size={16} weight="fill" className="text-purple-600 dark:text-purple-400" />
                  Cenário Realista (Recomendado)
                </span>
                <span className="text-base font-black text-purple-950 dark:text-purple-100">
                  {formatarBRL(metricas.projecaoProximoMesCents)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-purple-900/80 dark:text-purple-300">
                Run-rate da fábrica mantido + conversão média de 35% das propostas em aberto.
              </p>
            </div>

            {/* Cenário Otimista */}
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/40">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <RocketLaunch size={16} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                  Cenário Otimista
                </span>
                <span className="text-sm font-black text-emerald-950 dark:text-emerald-100">
                  {formatarBRL(metricas.projecaoOtimistaCents)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Capacidade plena de produção + conversão agressiva de 65% dos orçamentos.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por Material / Categoria */}
        <Card className="lg:col-span-2 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag size={20} weight="bold" className="text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-base font-bold">Faturamento por Tipo de Material</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Participação de cada tipo de serviço gráfico na receita total da gráfica
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metricas.categoriasMaterial.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum dado categorizado disponível ainda.
                </p>
              ) : (
                metricas.categoriasMaterial.map((cat, index) => {
                  const coresBarra = [
                    "bg-emerald-500",
                    "bg-blue-500",
                    "bg-indigo-500",
                    "bg-purple-500",
                    "bg-amber-500",
                    "bg-rose-500",
                  ];
                  const cor = coresBarra[index % coresBarra.length] ?? "bg-primary";

                  return (
                    <div key={cat.nome} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="font-bold text-foreground flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${cor}`} />
                          {cat.nome}
                          <span className="text-[11px] font-normal text-muted-foreground">
                            ({cat.quantidade} {cat.quantidade === 1 ? "pedido" : "pedidos"})
                          </span>
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-muted-foreground">
                            {cat.percentual}%
                          </span>
                          <span className="font-bold text-foreground">
                            {formatarBRL(cat.totalCents)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${cor}`}
                          style={{ width: `${Math.max(2, cat.percentual)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── TABELA DE MAIORES PEDIDOS & ORDENS RECENTES ─── */}
      <Card className="shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">
                Maiores Pedidos e Ordens de Serviço
              </CardTitle>
              <CardDescription className="text-xs">
                Pedidos com maior impacto na receita da gráfica identificados pelo agente e pelo CRM
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[140px] text-xs font-bold">Orçamento / OS</TableHead>
                  <TableHead className="text-xs font-bold">Cliente / Contato</TableHead>
                  <TableHead className="text-xs font-bold">Itens do Pedido</TableHead>
                  <TableHead className="text-xs font-bold">Etapa Atual</TableHead>
                  <TableHead className="text-xs font-bold">Previsão</TableHead>
                  <TableHead className="text-right text-xs font-bold">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricas.maioresPedidos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      Nenhum pedido com valor registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  metricas.maioresPedidos.map((pedido) => {
                    const cf = pedido.custom_fields ?? {};
                    const numeroOrc = (cf["numero_orcamento"] as string) || pedido.title.match(/#\d+/)?.[0] || `#${pedido.id.slice(0, 6)}`;
                    const itens = (cf["itens"] as string) || pedido.title.replace(/#\d+\s*/, "");
                    const valorFormatado = pedido.value_cents ? formatarBRL(pedido.value_cents) : "R$ 0,00";

                    return (
                      <TableRow key={pedido.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-bold text-foreground">
                          {numeroOrc}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-semibold text-foreground">
                            {pedido.contact_name || "Cliente WhatsApp"}
                          </div>
                          {pedido.contact_phone && (
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {pedido.contact_phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-foreground max-w-[280px] truncate" title={itens}>
                          {itens}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                            pedido.is_won
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : pedido.is_producao
                                ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300"
                                : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}>
                            {pedido.stage_name || "Em aberto"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {pedido.expected_close_date ? (
                            <span className="flex items-center gap-1 text-foreground font-medium">
                              <CalendarCheck size={14} className="text-muted-foreground" />
                              {pedido.expected_close_date.split("-").reverse().join("/")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                          {valorFormatado}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
