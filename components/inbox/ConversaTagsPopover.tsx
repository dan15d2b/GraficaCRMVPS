"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Tag } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { ConversationTagsEditor } from "./ConversationTagsEditor";

interface Props {
  conversationId: string;
  orgId: string;
  tags?: string[] | null;
}

export function ConversaTagsPopover({ conversationId, orgId, tags }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tagList = tags ?? [];

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
            <span className="text-[11px] text-text-subtle">
              {t("Sincroniza com WhatsApp")}
            </span>
          </div>
          <ConversationTagsEditor
            conversationId={conversationId}
            orgId={orgId}
            tags={tagList}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
