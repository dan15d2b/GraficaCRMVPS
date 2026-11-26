"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function SearchTrigger({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      {iconOnly ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label={t("Buscar...")}
          title={`${t("Buscar...")} (⌘K)`}
          data-testid="busca-flutuante-lupa"
        >
          <MagnifyingGlass size={16} aria-hidden />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <MagnifyingGlass size={14} aria-hidden />
          <span className="max-md:sr-only">{t("Buscar...")}</span>
          <kbd className="ml-2 hidden md:inline rounded-md border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </Button>
      )}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
