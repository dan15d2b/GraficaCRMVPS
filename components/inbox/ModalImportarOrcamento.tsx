"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParseOrcamento, useAplicarOrcamento } from "@/hooks/inbox/useOrcamentoParser";
import { calcularDataEntregaDiasUteis } from "@/lib/orcamentos/dias-uteis";
import { gerarMensagemDoOrcamento } from "@/lib/orcamentos/parser";
import type { OrcamentoExtraido } from "@/lib/orcamentos/tipos";
import {
  UploadCloud,
  FileText,
  ClipboardPaste,
  Sparkles,
  Loader2,
  Calendar,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactId?: string | null;
  onInserirNoComposer?: (texto: string) => void;
}

export function ModalImportarOrcamento({
  open,
  onOpenChange,
  conversationId,
  contactId,
  onInserirNoComposer,
}: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"pdf" | "texto">("pdf");
  const [textoColado, setTextoColado] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Dados extraídos e editáveis
  const [resultado, setResultado] = useState<OrcamentoExtraido | null>(null);
  const [valorTotalStr, setValorTotalStr] = useState("");
  const [prazoDiasUteis, setPrazoDiasUteis] = useState(5);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [numeroOrcamento, setNumeroOrcamento] = useState("");
  const [mensagemFormatada, setMensagemFormatada] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseMutation = useParseOrcamento();
  const aplicarMutation = useAplicarOrcamento();

  const isProcessing = parseMutation.isPending || aplicarMutation.isPending;

  function aplicarExtracao(dados: OrcamentoExtraido) {
    setResultado(dados);
    setValorTotalStr((dados.valor_total_cents / 100).toFixed(2).replace(".", ","));
    setPrazoDiasUteis(dados.prazo_dias_uteis || 5);
    setFormaPagamento(dados.forma_pagamento || "50% entrada + 50% na retirada (PIX/Cartão)");
    setNumeroOrcamento(dados.numero_orcamento || "");
    setMensagemFormatada(dados.mensagem_sugerida);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files[0]) {
      const f = files[0];
      setArquivo(f);
      try {
        const dados = await parseMutation.mutateAsync({ file: f });
        aplicarExtracao(dados);
        toast.success("Orçamento lido com sucesso!");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Falha ao processar PDF.");
      }
    }
  }

  async function handleParseTexto() {
    if (!textoColado.trim()) {
      toast.error("Cole o texto do orçamento antes de analisar.");
      return;
    }
    try {
      const dados = await parseMutation.mutateAsync({ text: textoColado.trim() });
      aplicarExtracao(dados);
      toast.success("Orçamento lido com sucesso!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar texto.");
    }
  }

  // Recalcular mensagem ao mudar prazo ou valor
  function handlePrazoChange(dias: number) {
    const d = Math.max(1, dias);
    setPrazoDiasUteis(d);

    if (resultado) {
      const entrega = calcularDataEntregaDiasUteis(new Date(), d);
      const centavos = Math.round(parseFloat(valorTotalStr.replace(/\./g, "").replace(",", ".") || "0") * 100);
      const novaMsg = gerarMensagemDoOrcamento({
        numero_orcamento: numeroOrcamento || undefined,
        itens: resultado.itens,
        valor_total_cents: centavos,
        forma_pagamento: formaPagamento,
        prazo_dias_uteis: d,
        data_estimada_entrega_formatada: entrega.formatadaCurta,
      });
      setMensagemFormatada(novaMsg);
    }
  }

  async function handleFinalizar(enviarImediato: boolean) {
    const centavos = Math.round(parseFloat(valorTotalStr.replace(/\./g, "").replace(",", ".") || "0") * 100);

    try {
      await aplicarMutation.mutateAsync({
        conversation_id: conversationId,
        contact_id: contactId ?? undefined,
        valor_total_cents: centavos,
        prazo_dias_uteis: prazoDiasUteis,
        forma_pagamento: formaPagamento,
        numero_orcamento: numeroOrcamento || undefined,
        mensagem_formatada: mensagemFormatada,
        enviar_whatsapp: enviarImediato,
        itens: resultado?.itens,
      });

      if (!enviarImediato && onInserirNoComposer) {
        onInserirNoComposer(mensagemFormatada);
        toast.success("Orçamento importado! Mensagem colocada no campo de resposta para envio.");
      } else if (!enviarImediato) {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(mensagemFormatada).catch(() => {});
        }
        toast.success("Orçamento importado! Mensagem copiada para a área de transferência.");
      } else {
        toast.success("Orçamento aplicado e enviado com sucesso!");
      }

      onOpenChange(false);
      // Reset
      setResultado(null);
      setArquivo(null);
      setTextoColado("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar orçamento.");
    }
  }

  const entregaPrevista = calcularDataEntregaDiasUteis(new Date(), prazoDiasUteis);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Sparkles className="size-4" />
            </span>
            Leitura Automática de Orçamento (PDF / Texto)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            O CRM lê os itens, valores, formas de pagamento e calcula o prazo de entrega em dias úteis.
          </DialogDescription>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4 py-2">
            <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as "pdf" | "texto")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pdf" className="flex items-center gap-1.5 text-xs">
                  <FileText className="size-3.5" />
                  <span>Arquivo PDF</span>
                </TabsTrigger>
                <TabsTrigger value="texto" className="flex items-center gap-1.5 text-xs">
                  <ClipboardPaste className="size-3.5" />
                  <span>Colar Texto</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {abaAtiva === "pdf" ? (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="application/pdf,image/*"
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-blue-400 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="size-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
                    {parseMutation.isPending ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : (
                      <UploadCloud className="size-6" />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {parseMutation.isPending
                      ? "Lendo itens, preços e medidas..."
                      : "Solte o PDF do orçamento aqui"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Gere o PDF no seu software de oficina e solte aqui para leitura imediata
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Label htmlFor="texto-orcamento" className="text-xs font-semibold">
                  Cole o texto copiado do orçamento:
                </Label>
                <Textarea
                  id="texto-orcamento"
                  rows={6}
                  placeholder="Cole aqui o texto copiado do orçamento (itens, quantidades, valores, etc)..."
                  value={textoColado}
                  onChange={(e) => setTextoColado(e.target.value)}
                  className="text-xs resize-none"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleParseTexto()}
                  disabled={parseMutation.isPending || !textoColado.trim()}
                  className="w-full bg-blue-600 text-white gap-1.5"
                >
                  {parseMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>Analisar e Extrair Orçamento</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Card de Revisão e Confirmação */
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center justify-between text-xs text-emerald-900">
              <span className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Orçamento extraído com sucesso!
              </span>
              <button
                type="button"
                onClick={() => setResultado(null)}
                className="text-[11px] text-emerald-700 underline hover:text-emerald-900 cursor-pointer"
              >
                Ler outro arquivo
              </button>
            </div>

            {/* Campos de Ajuste Rápido */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor Total (R$)</Label>
                <Input
                  value={valorTotalStr}
                  onChange={(e) => setValorTotalStr(e.target.value)}
                  placeholder="0,00"
                  className="h-8 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Prazo de Produção (Dias Úteis)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={prazoDiasUteis}
                  onChange={(e) => handlePrazoChange(parseInt(e.target.value, 10) || 1)}
                  className="h-8 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Cálculo de Data de Entrega */}
            <div className="rounded-lg bg-blue-50/80 border border-blue-200/80 p-2.5 flex items-center gap-2 text-xs text-blue-900">
              <Calendar className="size-4 text-blue-600 shrink-0" />
              <span>
                <strong>Previsão de Entrega:</strong> {entregaPrevista.formatadaExtenso} (
                {prazoDiasUteis} dias úteis sem sábados/domingos)
              </span>
            </div>

            {/* Lista de Itens */}
            {resultado.itens && resultado.itens.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Itens Identificados:</Label>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1 text-xs">
                  {resultado.itens.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-none">
                      <span className="truncate pr-2">
                        <strong>{it.quantidade}x</strong> {it.descricao}
                        {it.medidas ? ` [${it.medidas}]` : ""}
                      </span>
                      <span className="font-semibold text-slate-700 shrink-0">
                        {it.valor_total_cents > 0
                          ? (it.valor_total_cents / 100).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prévia da Mensagem do WhatsApp */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Mensagem Formatada para o WhatsApp:</Label>
              <Textarea
                rows={5}
                value={mensagemFormatada}
                onChange={(e) => setMensagemFormatada(e.target.value)}
                className="text-xs font-sans resize-none"
              />
            </div>
          </div>
        )}

        {resultado && (
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleFinalizar(false)}
              disabled={isProcessing}
              className="gap-1.5 text-xs"
            >
              <Copy className="size-3.5" />
              <span>Colar no Chat para Revisar</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => void handleFinalizar(true)}
              disabled={isProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
            >
              {aplicarMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              <span>Enviar Imediatamente ao Cliente</span>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
