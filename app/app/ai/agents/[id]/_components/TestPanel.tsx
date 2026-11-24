"use client";
/**
 * TestPanel — dry-run e treinamento interativo do agente.
 *
 * Envia sample message via POST `:test` (admin-only). Renderiza trace +
 * simulação de chat interativo com botão "Ensinar o Agente / Corrigir Resposta",
 * que grava Q&A diretamente no conhecimento do agente.
 * Inclui também o botão "Sincronizar Catálogo no Agente" para alimentar o agente
 * com todos os produtos e especificações da loja.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkle, Storefront, PencilSimple, CheckCircle, ArrowCounterClockwise } from "@/lib/ui/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { agentRunsKey } from "@/hooks/ai/useAgentRuns";
import { useT } from "@/hooks/i18n/useT";
import { useTelefoneExemplo } from "@/hooks/contacts/useTelefoneExemplo";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";

import type { SelectableChannel as ChannelSessionLite } from "@/lib/channels/selectable";
import {
  canalEmModoDeTeste,
  decidirAvisoDoModoDeTeste,
} from "@/lib/ai/elegibilidade/aviso-do-modo-de-teste";
import { useAcessoDaAiDoCanal } from "@/hooks/channels/useAcessoDaAiDoCanal";

import { AvisoDoModoDeTeste } from "./AvisoDoModoDeTeste";
import { RunTrace } from "./RunTrace";

interface Props {
  agent: AgentRow;
  draft: AgentVersionRow | null;
  published: AgentVersionRow | null;
  readOnly?: boolean;
  channelSessions?: ChannelSessionLite[];
}

interface TestResponse {
  data: {
    run_id: string;
    status: string;
    final_text?: string | null;
    tool_calls?: unknown;
    tokens_in?: number;
    tokens_out?: number;
    cost_cents?: number;
    latency_ms?: number;
    would_send_to?: { session?: string | null; chat_id?: string | null };
    stub?: boolean;
    candidates?: Array<{ body: string; trace: Array<{ gate: string; verdict: string }> }>;
    proposals?: Array<{ tool: string; arguments: unknown }>;
    impediments?: Array<{ code: string; message: string }>;
    warnings?: Array<{ code: string; message: string }>;
    restrictions?: string[];
    guardrails?: {
      passou: boolean;
      avaliado?: boolean;
      categorias: string[];
      termos: string[];
      naoAvaliados: Array<{ gate: string; porque: string }>;
    };
  };
}

interface ChatItem {
  id: string;
  role: "user" | "agent";
  text: string;
  question?: string;
  latencyMs?: number;
  tokens?: string;
  toolCalls?: unknown;
  guardrails?: TestResponse["data"]["guardrails"];
  corrected?: boolean;
}

function Verificacoes({ g }: { g: NonNullable<TestResponse["data"]["guardrails"]> }) {
  const t = useT();
  return (
    <div className="space-y-2" data-testid="teste-verificacoes">
      {g.avaliado === false ? null : g.passou ? (
        <p
          data-testid="teste-vazamento-limpo"
          className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs"
        >
          {t("A resposta não usa palavras internas do sistema.")}
        </p>
      ) : (
        <div
          data-testid="teste-vazamento-achado"
          className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs"
        >
          <p className="font-medium text-destructive">
            {t("Esta resposta usa palavras que o cliente não deveria ver.")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t("Em produção ela seria barrada e o assistente teria que reescrever. Encontrado:")}{" "}
            <span className="font-mono">{g.termos.join(", ")}</span>
          </p>
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer" data-testid="teste-nao-verificado">
          {t("A checagem textual não reavalia todas as regras (")}
          {g.naoAvaliados.length} {t("verificações fora desta camada)")}
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {g.naoAvaliados.map((n) => (
            <li key={n.gate}>— {n.porque}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function TestPanel({ agent, draft, published, readOnly, channelSessions }: Props) {
  const t = useT();
  const telefoneExemplo = useTelefoneExemplo();
  const target = draft ?? published;
  const qc = useQueryClient();

  const [message, setMessage] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactTags, setContactTags] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [syncingCatalog, setSyncingCatalog] = React.useState(false);

  // Histórico do Chat Interativo
  const [chatHistory, setChatHistory] = React.useState<ChatItem[]>([]);
  // Controle de correção do agente
  const [corrigindoId, setCorrigindoId] = React.useState<string | null>(null);
  const [respostaCorreta, setRespostaCorreta] = React.useState("");
  const [salvandoTreino, setSalvandoTreino] = React.useState(false);

  const canalDaVersao =
    channelSessions?.find((c) => c.id === target?.channel_session_id) ?? null;
  const acessoDoCanal = canalDaVersao?.acessoDaAi ?? null;
  const lerNumeros =
    !readOnly && canalEmModoDeTeste(acessoDoCanal) && (acessoDoCanal?.testNumbersCount ?? 0) > 0;
  const listaAutorizada = useAcessoDaAiDoCanal(canalDaVersao?.id, lerNumeros);
  const avisoDoNumero = decidirAvisoDoModoDeTeste({
    acesso: acessoDoCanal,
    numerosDeTeste: listaAutorizada.acesso?.test_phone_numbers ?? null,
    numeroEmTeste: contactPhone,
  });

  if (!target) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Configure e salve uma versão antes de testar.")}
      </p>
    );
  }

  const versionLabel =
    target.status === "published"
      ? `v${target.version_number} ${t("(publicada)")}`
      : `v${target.version_number} ${t("(rascunho)")}`;

  async function handleSyncCatalog() {
    if (!target) return;
    setSyncingCatalog(true);
    try {
      const res = await apiClient.post<{ total_sincronizados: number; mensagem: string }>(
        "/api/v1/ai/knowledge/sync-catalog",
        {
          agent_id: agent.id,
          version_id: target.id,
        },
      );
      toast.success(res.mensagem || `${res.total_sincronizados} produtos sincronizados com sucesso!`);
      qc.invalidateQueries({ queryKey: ["ai_knowledge"] });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || t("Erro ao sincronizar catálogo."));
      } else {
        toast.error(t("Erro inesperado ao sincronizar catálogo."));
      }
    } finally {
      setSyncingCatalog(false);
    }
  }

  async function handleRun() {
    const textoPergunta = message.trim();
    if (!textoPergunta) {
      toast.error(t("Informe uma mensagem de teste."));
      return;
    }
    if (!target) return;

    setPending(true);
    const userMsgId = `user-${Date.now()}`;
    const novoHistorico: ChatItem[] = [
      ...chatHistory,
      { id: userMsgId, role: "user", text: textoPergunta },
    ];
    setChatHistory(novoHistorico);
    setMessage("");

    try {
      const body: Record<string, unknown> = { sample_message: textoPergunta };
      if (contactName.trim() || contactPhone.trim()) {
        body.sample_contact = {
          ...(contactName.trim() ? { name: contactName.trim() } : {}),
          ...(contactPhone.trim() ? { phone: contactPhone.trim() } : {}),
        };
      }
      const etiquetasSimuladas = contactTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");
      if (etiquetasSimuladas.length) body.sample_tags = etiquetasSimuladas;

      const res = await apiClient.post<TestResponse>(
        `/api/v1/ai/agents/${agent.id}/versions/${target.id}/test`,
        body,
        { timeoutMs: 300_000 },
      );

      const agentText = res.data.final_text || t("Sem resposta em texto gerada pelo agente.");
      const agentMsgId = `agent-${Date.now()}`;
      setChatHistory([
        ...novoHistorico,
        {
          id: agentMsgId,
          role: "agent",
          text: agentText,
          question: textoPergunta,
          latencyMs: res.data.latency_ms,
          tokens: `${res.data.tokens_in ?? 0}/${res.data.tokens_out ?? 0}`,
          toolCalls: res.data.tool_calls,
          guardrails: res.data.guardrails,
        },
      ]);

      qc.invalidateQueries({ queryKey: agentRunsKey(agent.id) });
      toast.success(t("Resposta recebida!"));
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(t(err.message) || `${t("Erro")}: ${err.code}`);
      } else {
        toast.error(t("Erro inesperado ao consultar agente."));
      }
    } finally {
      setPending(false);
    }
  }

  async function handleSalvarTreino(pergunta: string) {
    if (!respostaCorreta.trim()) {
      toast.error(t("Digite a resposta esperada para ensinar o agente."));
      return;
    }
    if (!target) return;

    setSalvandoTreino(true);
    try {
      await apiClient.post("/api/v1/ai/knowledge/train", {
        agent_id: agent.id,
        version_id: target.id,
        question: pergunta,
        answer: respostaCorreta.trim(),
      });

      toast.success(t("✅ Resposta ensinada com sucesso! O agente aprendeu como responder a essa pergunta."));
      if (corrigindoId) {
        setChatHistory((prev) =>
          prev.map((item) => (item.id === corrigindoId ? { ...item, corrected: true } : item)),
        );
      }
      setCorrigindoId(null);
      setRespostaCorreta("");
      qc.invalidateQueries({ queryKey: ["ai_knowledge"] });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || t("Erro ao ensinar resposta."));
      } else {
        toast.error(t("Erro inesperado ao salvar treinamento."));
      }
    } finally {
      setSalvandoTreino(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Banner de Sincronização do Catálogo e Versão */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-500/20 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkle size={22} weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{t("Simulação e Treinamento do Agente")}</span>
              <Badge variant="outline" className="text-xs">{versionLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {target.provider} · {target.model} — {t("Faça perguntas, confira as respostas e corrija para treinar o agente.")}
            </p>
          </div>
        </div>

        <Button
          onClick={handleSyncCatalog}
          disabled={syncingCatalog || readOnly}
          variant="outline"
          className="gap-2 border-indigo-300 font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          <Storefront size={18} weight="bold" />
          {syncingCatalog ? t("Sincronizando Catálogo…") : t("Sincronizar Catálogo no Agente")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Painel Esquerdo: Entrada de Teste & Parâmetros */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">{t("Enviar Pergunta como Cliente")}</h3>

            <div className="space-y-3">
              <div>
                <Label htmlFor="test-message" className="text-xs">{t("Pergunta / Mensagem de teste")}</Label>
                <Textarea
                  id="test-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleRun();
                    }
                  }}
                  placeholder={t("Ex.: Olá, quanto custa o banner 1x1m com ilhós? Tem foto?")}
                  rows={3}
                  disabled={pending || readOnly}
                  className="mt-1 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="test-name" className="text-xs">{t("Nome (opcional)")}</Label>
                  <Input
                    id="test-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="João Silva"
                    disabled={pending || readOnly}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="test-phone" className="text-xs">{t("Telefone (opcional)")}</Label>
                  <Input
                    id="test-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder={telefoneExemplo}
                    disabled={pending || readOnly}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="test-tags" className="text-xs">{t("Etiquetas simuladas")}</Label>
                <Input
                  id="test-tags"
                  value={contactTags}
                  onChange={(e) => setContactTags(e.target.value)}
                  placeholder="vip, orcamento"
                  disabled={pending || readOnly}
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <AvisoDoModoDeTeste aviso={avisoDoNumero} podeConfigurar={!readOnly} notaDoSandbox />

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleRun} disabled={pending || readOnly} className="w-full">
                  {pending ? t("Consultando Agente…") : t("Enviar Pergunta")}
                </Button>
                {chatHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChatHistory([])}
                    title={t("Limpar conversa de teste")}
                  >
                    <ArrowCounterClockwise size={16} />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">💡 {t("Como treinar o agente:")}</p>
            <p className="mt-1">
              {t("Envie perguntas com dúvidas comuns ou cotações de clientes. Se a resposta da IA não for a ideal, clique em ")}
              <span className="font-semibold text-primary">"Ensinar o Agente"</span>
              {t(" logo abaixo da resposta para gravar a explicação correta no conhecimento dele.")}
            </p>
          </div>
        </div>

        {/* Painel Direito: Chat Interativo de Treinamento */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="flex min-h-[460px] flex-col rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <span className="text-sm font-semibold">{t("Chat de Simulação e Treinamento")}</span>
              <span className="text-xs text-muted-foreground">{chatHistory.length} {t("mensagens")}</span>
            </div>

            {chatHistory.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Sparkle size={24} />
                </div>
                <p className="font-medium text-foreground">{t("Nenhuma mensagem de teste ainda")}</p>
                <p className="mt-1 max-w-sm text-xs">
                  {t("Digite uma pergunta ao lado para simular o atendimento e conferir a resposta do atendente de IA.")}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {/* Balão da Mensagem */}
                    <div
                      className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        msg.role === "user"
                          ? "rounded-br-sm bg-primary text-primary-foreground font-normal"
                          : "rounded-bl-sm bg-muted text-foreground border border-border/50 font-normal"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>

                    {/* Metadados e Ações para a resposta do Agente */}
                    {msg.role === "agent" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {typeof msg.latencyMs === "number" && (
                          <span className="text-muted-foreground">{msg.latencyMs}ms</span>
                        )}
                        {msg.tokens && (
                          <span className="text-muted-foreground">· tokens: {msg.tokens}</span>
                        )}
                        {msg.corrected && (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={14} weight="fill" />
                            {t("Treinado com correção")}
                          </span>
                        )}

                        {/* Botão de Ensinar / Corrigir Resposta */}
                        <button
                          type="button"
                          onClick={() => {
                            setCorrigindoId(corrigindoId === msg.id ? null : msg.id);
                            setRespostaCorreta(msg.text);
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          <PencilSimple size={14} />
                          {corrigindoId === msg.id ? t("Fechar correção") : t("Ensinar o Agente / Corrigir")}
                        </button>
                      </div>
                    )}

                    {/* Formulário Inline de Correção e Aprendizado */}
                    {msg.role === "agent" && corrigindoId === msg.id && (
                      <div className="mt-3 w-full rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {t("Ensinar o Agente: Qual é a resposta correta esperada?")}
                          </span>
                          <span className="text-muted-foreground">
                            {t("Pergunta:")} "{msg.question}"
                          </span>
                        </div>

                        <Textarea
                          value={respostaCorreta}
                          onChange={(e) => setRespostaCorreta(e.target.value)}
                          rows={3}
                          placeholder={t("Escreva exatamente como o atendente deve responder a essa dúvida...")}
                          className="mb-2 bg-background text-xs"
                          disabled={salvandoTreino}
                        />

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCorrigindoId(null)}
                            disabled={salvandoTreino}
                          >
                            {t("Cancelar")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => msg.question && handleSalvarTreino(msg.question)}
                            disabled={salvandoTreino}
                          >
                            {salvandoTreino ? t("Salvando no Conhecimento…") : t("Salvar no Conhecimento do Agente")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Detalhes de verificações / Guardrails se houver */}
                    {msg.guardrails && (
                      <div className="mt-2 w-full max-w-[85%]">
                        <Verificacoes g={msg.guardrails} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
