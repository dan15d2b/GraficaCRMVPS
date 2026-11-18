"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OrcamentoExtraido } from "@/lib/orcamentos/tipos";

export function useParseOrcamento() {
  return useMutation({
    mutationFn: async (input: { file?: File; text?: string }) => {
      let res: Response;

      if (input.file) {
        const formData = new FormData();
        formData.append("file", input.file);
        res = await fetch("/api/v1/orcamentos/parse", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/v1/orcamentos/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: input.text || "" }),
        });
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message || "Falha ao processar o orçamento.");
      }

      return body.data as OrcamentoExtraido;
    },
  });
}

export function useAplicarOrcamento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (dados: {
      conversation_id: string;
      contact_id?: string;
      lead_id?: string;
      valor_total_cents: number;
      prazo_dias_uteis: number;
      forma_pagamento?: string;
      numero_orcamento?: string;
      mensagem_formatada: string;
      enviar_whatsapp?: boolean;
      itens?: unknown[];
    }) => {
      const res = await fetch("/api/v1/orcamentos/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message || "Falha ao aplicar o orçamento.");
      }

      return body.data;
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["crm-summary", vars.contact_id] });
      void qc.invalidateQueries({ queryKey: ["messages", vars.conversation_id] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
}
