"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";

export interface SegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  segment?: string;
}

export function SegmentError({ error, reset, segment }: SegmentErrorProps) {
  const t = useT();
  const [eventId, setEventId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /loading chunk/i.test(error?.message ?? "") ||
    /failed to fetch dynamically imported module/i.test(error?.message ?? "") ||
    /dynamically imported module/i.test(error?.message ?? "") ||
    /failed to load/i.test(error?.message ?? "");

  useEffect(() => {
    // Se o erro for de chunk antigo após deploy na VPS, recarrega automaticamente
    if (isChunkError && typeof window !== "undefined") {
      const lastReload = sessionStorage.getItem("chunk_reload_ts");
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 15000) {
        sessionStorage.setItem("chunk_reload_ts", String(now));
        window.location.reload();
        return;
      }
    }

    const id = Sentry.captureException(error, {
      tags: segment ? { segment } : undefined,
    });
    setEventId(id);
  }, [error, segment, isChunkError]);

  const displayId = eventId ?? error.digest ?? "—";

  function copyId() {
    void copyToClipboard(displayId).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }

  function handleRetry() {
    if (typeof window !== "undefined") {
      window.location.reload();
    } else {
      reset();
    }
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">
          {isChunkError ? t("Atualizando para a nova versão…") : t("Algo deu errado")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunkError
            ? t("O sistema foi atualizado na VPS. Recarregando a página com as novas melhorias...")
            : t("Tente novamente em instantes. Se persistir, contate o suporte com o ID abaixo.")}
        </p>
        {!isChunkError && (
          <div className="mt-4 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
            ID: {displayId}
          </div>
        )}
        <div className="mt-4 flex justify-center gap-2">
          {!isChunkError && (
            <Button type="button" variant="outline" onClick={copyId}>
              {copied ? t("Copiado!") : t("Copiar ID")}
            </Button>
          )}
          <Button type="button" onClick={handleRetry}>
            {isChunkError ? t("Recarregar agora") : t("Tentar de novo")}
          </Button>
        </div>
      </Card>
    </main>
  );
}
