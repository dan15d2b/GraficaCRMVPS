"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowsClockwise, CircleNotch } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { useRouter } from "next/navigation";

export function BotaoImportarEtiquetasWhatsapp() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleImport() {
    setLoading(true);
    try {
      const res = await apiClient.post<{
        data: { etiquetas_importadas: number; conversas_etiquetadas: number };
      }>("/api/v1/channels/labels/import", {});

      toast.success(
        `Sincronização concluída: ${res.data.etiquetas_importadas} etiquetas importadas e ${res.data.conversas_etiquetadas} conversas atualizadas.`,
      );
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Falha ao sincronizar etiquetas do WhatsApp.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleImport}
      disabled={loading}
      className="flex items-center gap-2"
    >
      {loading ? (
        <CircleNotch className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowsClockwise className="h-4 w-4" />
      )}
      {loading ? "Sincronizando..." : "Sincronizar do WhatsApp"}
    </Button>
  );
}
