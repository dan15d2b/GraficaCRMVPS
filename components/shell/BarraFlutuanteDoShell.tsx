"use client";

import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MobileSidebar } from "./MobileSidebar";
import { SearchTrigger } from "./SearchTrigger";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";

/**
 * Barra flutuante usada no Inbox quando o cabeçalho fixo (`TopBar`) fica oculto
 * para liberar toda a altura vertical das conversas: reúne empresa, busca apenas
 * por ícone de lupa, avisos, tema/idioma e perfil em uma cápsula discreta.
 */
export function BarraFlutuanteDoShell() {
  return (
    <div
      data-testid="barra-flutuante-shell"
      className="fixed top-2 right-3 z-30 flex items-center gap-0.5 rounded-full border border-border/80 bg-surface-elevated/92 px-1.5 py-0.5 shadow-md backdrop-blur-md"
    >
      <MobileSidebar />
      <TenantSwitcher compact />
      <SearchTrigger iconOnly />
      <AlertsBell />
      <AvisoDePropostaEmDestaque />
      <UserMenu compact />
    </div>
  );
}
