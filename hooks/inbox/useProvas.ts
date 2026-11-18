"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArteProva } from "@/lib/provas/tipos";

export function useProvasDaConversa(conversationId?: string | null) {
  return useQuery<ArteProva[]>({
    queryKey: ["provas", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await fetch(`/api/v1/provas?conversation_id=${conversationId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!conversationId,
    refetchInterval: 10_000, // Atualiza a cada 10s se houver aprovação pendente
  });
}

export function useCriarProva() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dados: {
      conversation_id: string;
      contact_id?: string;
      lead_id?: string;
      os_number?: string;
      titulo: string;
      file_url: string;
      file_name: string;
      file_mime?: string;
      file_size_bytes?: number;
      enviar_whatsapp?: boolean;
    }) => {
      const res = await fetch("/api/v1/provas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message || "Falha ao enviar prova digital.");
      }
      return body.data as ArteProva;
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["provas", vars.conversation_id] });
      void queryClient.invalidateQueries({ queryKey: ["messages", vars.conversation_id] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
