"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { Tag, ArrowsClockwise } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { apiClient } from "@/lib/api/client";
import { ConversationTagsEditor } from "./ConversationTagsEditor";

interface Props {
  conversationId: string;
  orgId: string;
  tags?: string[] | null;
}

export function ConversaTagsPopover({ conversationId, orgId, tags }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const tagList = tags ?? [];

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiClient.post<{ data: { tags: string[]; remote_tags: string[] } }>(
        `/api/v1/conversations/${conversationId}/sync-tags`,
        {},
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["crm-summary"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["conversation-tag-vocabulary"] });

      const remoteCount = res.data?.remote_tags?.length ?? 0;
      if (remoteCount > 0) {
        toast.success(t(`${remoteCount} tag(s) do WhatsApp sincronizada(s)!`));
      } else {
        toast.success(t("Tags sincronizadas com o WhatsApp com sucesso!"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Não foi possível sincronizar com o WhatsApp."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-full border-border/80 px-2.5 text-xs text-text-muted hover:bg-surface-elevated hover:text-foreground"
          title={t("Gerenciar tags da conversa")}
        >
          <Tag size={13} weight="regular" aria-hidden />
          {tagList.length > 0 ? (
            <div className="flex items-center gap-1">
              <ChipDeEtiqueta tag={tagList[0]!} className="h-4 px-1.5 text-[10px]" />
              {tagList.length > 1 && (
                <span className="text-[10px] tabular-nums font-semibold text-text-subtle">
                  +{tagList.length - 1}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-normal">{t("Tags")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 shadow-lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="text-xs font-semibold text-foreground">
              {t("Tags da conversa")}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="h-6 gap-1 px-1.5 text-[11px] text-text-subtle hover:text-foreground"
              title={t("Sincronizar tags agora com o WhatsApp")}
            >
              <ArrowsClockwise
                size={12}
                className={syncing ? "animate-spin text-primary" : ""}
                aria-hidden
              />
              <span>{syncing ? t("Sincronizando...") : t("Sincronizar WhatsApp")}</span>
            </Button>
          </div>
          <ConversationTagsEditor
            conversationId={conversationId}
            orgId={orgId}
            tags={tagList}
            onSync={handleSync}
            syncing={syncing}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
