"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  Download,
  ExternalLink,
  ShieldAlert,
  Loader2,
  Send,
  FileText,
  Clock,
  Printer,
  X,
} from "lucide-react";
import type { ProvaPublicaDTO } from "@/lib/provas/tipos";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function ProvaPublicaPage({ params }: PageProps) {
  const { token } = use(params);

  const [prova, setProva] = useState<ProvaPublicaDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Checklist
  const [checkTextos, setCheckTextos] = useState(false);
  const [checkMedidas, setCheckMedidas] = useState(false);
  const [checkCores, setCheckCores] = useState(false);

  // Ações
  const [submitting, setSubmitting] = useState(false);
  const [sucessoAprovacao, setSucessoAprovacao] = useState(false);
  const [modoAjuste, setModoAjuste] = useState(false);
  const [notasAjuste, setNotasAjuste] = useState("");
  const [sucessoAjuste, setSucessoAjuste] = useState(false);

  // Modal zoom imagem
  const [zoomAberto, setZoomAberto] = useState(false);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/prova/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message || "Prova não encontrada ou link expirado.");
        }
        const data = await res.json();
        setProva(data.data);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Erro ao carregar a prova.");
      } finally {
        setLoading(false);
      }
    }
    void carregar();
  }, [token]);

  const checklistCompleto = checkTextos && checkMedidas && checkCores;

  async function handleAprovar() {
    if (!checklistCompleto) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/prova/${token}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "aprovar" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || "Falha ao enviar aprovação.");
      }
      setSucessoAprovacao(true);
      if (prova) {
        setProva({
          ...prova,
          status: "aprovada",
          decided_at: new Date().toISOString(),
          decided_via: "link",
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao aprovar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSolicitarAjuste() {
    if (!notasAjuste.trim()) {
      alert("Por favor, descreva o que precisa ser ajustado.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/prova/${token}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rejeitar", notes: notasAjuste.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message || "Falha ao enviar solicitação.");
      }
      setSucessoAjuste(true);
      setModoAjuste(false);
      if (prova) {
        setProva({
          ...prova,
          status: "rejeitada",
          decided_at: new Date().toISOString(),
          decided_via: "link",
          rejection_reason: notasAjuste.trim(),
        });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao solicitar ajuste.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <Loader2 className="size-10 animate-spin text-blue-600 mb-3" />
        <h2 className="text-base font-medium text-slate-700">Carregando prova digital…</h2>
      </div>
    );
  }

  if (errorMsg || !prova) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          <ShieldAlert className="size-12 text-rose-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Prova Indisponível</h1>
          <p className="text-sm text-slate-600 mb-6">{errorMsg || "Esta prova não existe ou expirou."}</p>
          <p className="text-xs text-slate-400">Entre em contato pelo WhatsApp para receber um novo link.</p>
        </div>
      </div>
    );
  }

  const isPdf = prova.file_mime.includes("pdf") || prova.file_name.toLowerCase().endsWith(".pdf");
  const isPendente = prova.status === "pendente" && !sucessoAprovacao && !sucessoAjuste;
  const isAprovada = prova.status === "aprovada" || sucessoAprovacao;
  const isRejeitada = prova.status === "rejeitada" || sucessoAjuste;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-16">
      {/* Topo / Barra da Empresa */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {prova.empresa.logo_url ? (
              <img
                src={prova.empresa.logo_url}
                alt={prova.empresa.nome}
                className="h-8 max-w-[120px] object-contain"
              />
            ) : (
              <div
                className="flex size-9 items-center justify-center rounded-lg font-bold text-white shadow-xs"
                style={{ backgroundColor: prova.empresa.cor_destaque || "#2563eb" }}
              >
                <Printer className="size-5" />
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-slate-900 leading-tight">{prova.empresa.nome}</div>
              <div className="text-xs text-slate-500">Validação de Layout & Prova</div>
            </div>
          </div>

          {prova.os_number && (
            <div className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
              O.S. #{prova.os_number}
            </div>
          )}
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-4xl px-4 pt-6">
        {/* Banner de Status (se já foi aprovada ou rejeitada) */}
        {isAprovada && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-emerald-950">Arte Aprovada com Sucesso!</h2>
                <p className="mt-1 text-sm text-emerald-800">
                  Sua confirmação formal foi registrada. O material foi liberado e encaminhado diretamente para
                  a fila de produção e impressão.
                </p>
                {prova.decided_at && (
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    Aprovado em: {new Date(prova.decided_at).toLocaleString("pt-BR")}
                    {prova.decided_via ? ` via ${prova.decided_via === "whatsapp" ? "WhatsApp" : "Link Web"}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isRejeitada && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <Clock className="size-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-amber-950">Solicitação de Ajuste Registrada</h2>
                <p className="mt-1 text-sm text-amber-800">
                  Nossa equipe de arte já recebeu suas observações e fará as devidas alterações. Você receberá uma
                  nova prova em breve pelo WhatsApp.
                </p>
                {prova.rejection_reason && (
                  <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs text-amber-900 border border-amber-200/60 font-mono">
                    "{prova.rejection_reason}"
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Card do Arquivo & Prévia */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{prova.titulo}</h1>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <FileText className="size-3.5 text-slate-400" />
                <span>{prova.file_name}</span>
                {prova.file_size_bytes > 0 && (
                  <span>• {(prova.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={prova.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                <span>Abrir Original</span>
              </a>
              <a
                href={prova.file_url}
                download={prova.file_name}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Download className="size-3.5" />
                <span>Baixar</span>
              </a>
            </div>
          </div>

          {/* Área de Visualização */}
          <div className="bg-slate-900/5 p-4 sm:p-8 flex items-center justify-center min-h-[340px]">
            {isPdf ? (
              <div className="w-full flex flex-col items-center justify-center gap-4 py-8">
                <div className="size-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
                  <FileText className="size-8" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800">Documento em Formato PDF</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Para visualizar com qualidade máxima e vetorização, abra o arquivo no visualizador completo.
                  </p>
                </div>
                <a
                  href={prova.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="size-4" />
                  <span>Visualizar PDF Completo</span>
                </a>
              </div>
            ) : (
              <div className="relative group cursor-pointer max-w-full" onClick={() => setZoomAberto(true)}>
                <img
                  src={prova.file_url}
                  alt={prova.titulo}
                  className="max-h-[500px] w-auto max-w-full rounded-lg object-contain shadow-md border border-slate-200/80 group-hover:opacity-95 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow-md backdrop-blur-xs">
                    <ZoomIn className="size-3.5" />
                    Clique para ampliar
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Formulário de Aprovação / Decisão (só mostra se pendente) */}
        {isPendente && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">Conferência Obrigatória do Material</h2>
            <p className="text-xs text-slate-500 mb-4">
              Por favor, marque as caixas abaixo confirmando que você revisou todos os pontos da arte:
            </p>

            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={checkTextos}
                  onChange={(e) => setCheckTextos(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800">Conferi textos, nomes e telefones:</span>
                  <span className="text-slate-600 ml-1">
                    Não há erros de digitação, ortografia, números de WhatsApp ou endereços incorretos.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={checkMedidas}
                  onChange={(e) => setCheckMedidas(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800">Conferi as medidas e acabamentos:</span>
                  <span className="text-slate-600 ml-1">
                    A proporção da imagem e as especificações de tamanho atendem ao que preciso.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={checkCores}
                  onChange={(e) => setCheckCores(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-slate-800">Conferi as imagens e o layout geral:</span>
                  <span className="text-slate-600 ml-1">
                    Fotos e logotipos estão na posição correta e aprovados para impressão.
                  </span>
                </div>
              </label>
            </div>

            {/* Aviso de responsabilidade */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 mb-6 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Importante:</strong> Após a sua confirmação, o arquivo é enviado de forma automatizada
                para as máquinas de impressão. A gráfica não se responsabiliza por erros de digitação já
                aprovados pelo cliente nesta prova.
              </span>
            </div>

            {/* Modo Ajuste */}
            {modoAjuste ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-4">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Descreva as alterações necessárias:</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Seja específico (ex: "Trocar o telefone no rodapé para (19) 99999-9999 e mudar o fundo para azul").
                </p>
                <textarea
                  rows={3}
                  value={notasAjuste}
                  onChange={(e) => setNotasAjuste(e.target.value)}
                  placeholder="Escreva aqui as alterações..."
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModoAjuste(false)}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !notasAjuste.trim()}
                    onClick={() => void handleSolicitarAjuste()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    <span>Enviar Correções</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Botões de Ação */}
            {!modoAjuste && (
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  disabled={!checklistCompleto || submitting}
                  onClick={() => void handleAprovar()}
                  className={`flex-1 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-sm font-bold shadow-sm transition-all cursor-pointer ${
                    checklistCompleto
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99] shadow-emerald-600/20"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-5" />
                  )}
                  <span>Aprovar Arte e Liberar Produção</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setModoAjuste(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-3 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span>Solicitar Ajuste</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Zoom Tela Cheia */}
      {zoomAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xs cursor-zoom-out"
          onClick={() => setZoomAberto(false)}
        >
          <button
            type="button"
            onClick={() => setZoomAberto(false)}
            className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors cursor-pointer"
          >
            <X className="size-6" />
          </button>
          <img
            src={prova.file_url}
            alt={prova.titulo}
            className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
