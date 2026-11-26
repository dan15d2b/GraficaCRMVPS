"use client";
import { useState, type RefObject } from "react";
import { useT } from "@/hooks/i18n/useT";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JanelaSelo } from "@/components/inbox/JanelaSelo";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Phone, MagnifyingGlass, DotsThree, Pause, Archive, EyeSlash, UserCircle, UsersThree } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import {
  useMarkPersonalContact,
  useUnmarkPersonalContact,
} from "@/hooks/contacts/usePersonalContact";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  useArchiveConversation,
  useCloseConversation,
  useReopenConversation,
} from "@/hooks/inbox/useCloseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { OwnerBadge } from "@/components/kanban/OwnerBadge";
import { FaixaDaCarteira } from "@/components/inbox/FaixaDaCarteira";
import { comandoDaConversa, ROTULO_DO_MOTIVO } from "@/lib/inbox/comando-da-conversa";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { DialogoDeConvite, ParticipantesDaConversa } from "@/components/inbox/ParticipantesDaConversa";
import { DialButton } from "@/components/voice/DialButton";
import { VideoCallButton } from "@/components/inbox/VideoCallButton";
import { ItemReservarServico, ReservarServicoNaConversa } from "@/components/agenda/ReservarServicoNaConversa";
import { motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { useEnderecoDaResposta } from "@/hooks/inbox/useEnderecoDaResposta";
import { rotuloDoCanalDaConversa } from "@/lib/channels/estado";
import { ConversaAcoesDoFunil } from "@/components/inbox/ConversaAcoesDoFunil";
import { ConversaTagsPopover } from "@/components/inbox/ConversaTagsPopover";

interface Props {
  conversation: ConversationWithContact;
  /**
   * A busca DENTRO da conversa (#1793): abre um campo que filtra só as
   * mensagens já carregadas. O ref devolve o foco a este botão quando o campo
   * fecha — senão o Esc largava o foco no `body`.
   */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  botaoBuscaRef?: RefObject<HTMLButtonElement | null>;
  /** Seleciona outra conversa no Inbox — a aba Número do Transferir abre a do outro número. */
  onAbrirConversa?: (id: string) => void;
  /** Reserva espaço à direita quando o painel lateral CRM está recolhido, evitando colisão com a barra flutuante. */
  reservarDireitaFlutuante?: boolean;
}

/**
 * O CHIP NOMEIA CICLO DE VIDA, NÃO COMANDO.
 *
 * Ele afirmava quem manda — "Automático atendendo", "Aguardando atendente" — a
 * 20px de um selo que responde a MESMA pergunta por outra fonte, e as duas se
 * contradiziam na tela: `conversations.status` não acompanha silêncio, trava de
 * contato nem atribuição, e o motor nunca o lê. Medido em 2026-08-30 num print
 * do dono: "Aguardando atendente" e "Automático" no mesmo cabeçalho.
 *
 * Quem responde "quem manda" é o `OwnerBadge`, que vem de `comandoDaConversa`.
 * Aqui fica só o que o status realmente sabe: o episódio está aberto ou acabou.
 *
 * Cobre os SETE valores do CHECK de propósito — o call site é
 * `t(STATUS_LABEL[status] ?? status)`, e um buraco imprime o token cru em inglês
 * no rosto do atendente. Vigiado pelo invariante de espelho.
 */
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aberta",
  claimed: "Aberta",
  ai_handling: "Aberta",
  resolved: "Resolvida",
  closed: "Fechada",
  archived: "Arquivada",
};

export function ConversationHeader({
  conversation,
  onAbrirConversa,
  onBuscar,
  buscaAberta,
  botaoBuscaRef,
  reservarDireitaFlutuante = false,
}: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const arquivar = useArchiveConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  // "Existe automático nesta org?" — sem isto o selo afirmava que o robô estava
  // atendendo em instalação que nunca configurou agente nenhum.
  const automaticoDaOrg = useAutomaticoAtivo();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmFecharOpen, setConfirmFecharOpen] = useState(false);
  /**
   * A ESCOLHA AO FECHAR (#3313, item 1), e ela começa MARCADA em "devolver".
   *
   * O padrão não é preferência de produto: é o desfecho que a operação espera
   * ao fechar. Medido na issue — a equipe fechava conversas achando que a trava
   * de humano tinha ido embora com elas, e a próxima mensagem daquele cliente,
   * dias depois, ficava sem resposta da IA. "Manter com a equipe" continua a um
   * clique e é relembrado a cada abertura do diálogo (quem escolheu manter na
   * conversa anterior não deve ver a escolha já virada na seguinte).
   */
  const [devolverAoFechar, setDevolverAoFechar] = useState(true);
  const [confirmArquivarOpen, setConfirmArquivarOpen] = useState(false);
  const [confirmPessoalOpen, setConfirmPessoalOpen] = useState(false);
  // O diálogo do convite é do CABEÇALHO, não do item do menu (#3003): um
  // `dialog` modal dentro de um `menu` modal deixa a página inteira aria-hidden
  // enquanto o menu está aberto, e o que vem depois do convite — o avatar de
  // quem entrou, por exemplo — fica invisível para leitores de tela e para o
  // e2e. Aqui o item só levanta a bandeira e o menu fecha como qualquer outro.
  const [conviteAberto, setConviteAberto] = useState(false);
  // A folha de reserva segue o MESMO desenho do convite: o item do ⋯ só levanta
  // a bandeira, a folha mora fora do menu e o menu fecha como qualquer outro.
  const [reservaAberta, setReservaAberta] = useState(false);

  const c = conversation.contacts ?? null;
  /**
   * A TRAVA DE HUMANO MORA NO CONTATO, não na conversa — e é por isso que
   * fechar a conversa não a solta. Enquanto `force_human` for `true`, os três
   * guards do motor (`skip("force_human")`, `isLeadInHandoff`, `before-send`)
   * continuam vetando a IA. Sem esta leitura, a escolha do fechamento apareceria
   * em conversa nenhuma (ou em todas, que é pior: perguntaria sobre uma trava
   * que não existe).
   */
  const contatoTravadoComEquipe = c?.force_human === true;
  const displayName = rotuloParaAEquipe(c, t);
  /**
   * POR ONDE ESTA CONVERSA ENTROU — o mesmo rótulo da lista e da tela de
   * canais (#2383). `null` quando não há canal, e aí o badge não existe.
   */
  const rotuloCanal = rotuloDoCanalDaConversa(conversation.channel_sessions, t);
  const phone = c?.phone_number ? phoneForDisplay(c.phone_number) : null;
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;
  /**
   * "ASSUMIR" NÃO SE OFERECE A QUEM JÁ É O DONO (#3003).
   *
   * A condição era `isOpen`, e com a conversa JÁ assumida por mim ela é
   * verdadeira (status `open`) — então o cabeçalho desenhava "Assumir" e
   * "Liberar" lado a lado, dois botões para o mesmo slot, sendo o primeiro um
   * no-op: `fn_conversation_assign` com `expected_assignee` igual ao dono não
   * muda nada. É exatamente a pergunta da issue ("o que acontece se eu clicar
   * aqui?") respondida com "nada".
   *
   * O #3012 continua de pé e é o que a condição preserva: com a conversa SEM
   * dono o botão existe (é a saída da trava do compositor), e com ela assumida
   * por OUTRA pessoa também (é o gesto de reatribuir). O que sai é só o botão
   * que não faz nada.
   */
  const podeAssumir = isOpen && !isMineAssigned;

  // Marcar/desmarcar pessoal (spec 21, etapa 15 — botão no cabeçalho).
  //
  // GERENTE pode (spec decisão 1, D3): pessoal é decisão operacional — esconder
  // uma conversa da operação. Desbloquear exige ADMIN porque reabre um canal
  // que o cliente fechou (direito do titular, LGPD): dois gestos parecidos,
  // dois gates diferentes, cada um com seu motivo.
  //
  // Os hooks ficam AQUI, antes de qualquer early return (a ordem dos hooks não
  // pode mudar entre renderizações); com contato ausente o id vazio nunca
  // dispara porque o botão nem é desenhado.
  const ehPessoal = c?.is_personal === true;
  const podeMarcarPessoal =
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  /**
   * ATENDIMENTO CONJUNTO (#2542): quem pode CONVIDAR é o dono da conversa ou um
   * gestor+ — exatamente o gate da rota. A tela não oferece o que a rota recusa:
   * um botão que devolve 403 é pior que um botão que não existe, porque a pessoa
   * descobre o limite depois de escolher o colega na lista. Não é gate de
   * SEGURANÇA (esse mora na rota, que revalida papel e organização): é o mesmo
   * desenho de `podeMarcarPessoal`, que também espelha a régua do servidor.
   */
  const podeConvidar =
    isMineAssigned ||
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  // Reservar exige papel de atendente (o mesmo gate da rota); grupo não é pessoa.
  const podeReservar =
    !conversation.is_group && !!c?.id && activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const marcarPessoal = useMarkPersonalContact(c?.id ?? "");
  const desmarcarPessoal = useUnmarkPersonalContact(c?.id ?? "");

  // Para qual número a resposta sai (Spec 31, B2). Fica ANTES do retorno de
  // leitura-só, porque a ordem dos hooks não pode mudar entre renderizações.
  const enderecoDaResposta = useEnderecoDaResposta(conversation.id, conversation.last_inbound_at ?? null);
  const endereco = enderecoDaResposta.data?.data ?? null;

  /**
   * QUEM MANDA, uma pergunta com uma resposta.
   *
   * Este bloco era três leituras parciais. O selo e o botão de volta liam duas
   * travas (`bot_silenced_until || force_human`); a linha da lista lia uma, por
   * COR; o painel não lia nenhuma. Desde a 0173 há uma quarta situação —
   * "alguém assumiu" — e continuar somando condições à mão aqui é como as três
   * leituras divergiram em primeiro lugar. A regra mora em `lib/inbox`,
   * espelhando os gates que o MOTOR lê, e esta tela só a consome.
   */
  const fatosDoComando = {
    status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: conversation.contacts?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
    tags: conversation.tags,
  };
  const { comando, automaticoAtivo, travaVigente, motivo } = comandoDaConversa(fatosDoComando);
  /**
   * O QUE "LIBERAR" FAZ DEPENDE DO ESTADO, e a guia do botão (#3003) não pode
   * prometer o automático de volta quando ele não volta.
   *
   * `fn_conversation_assign` com dono `null` deixa a conversa aberta e sem dono,
   * mas só limpa `bot_silenced_until` quando NÃO houve escalação
   * (`last_handoff_at is null`). Depois de uma escalação, com o contato travado
   * (`force_human`), descadastrado, em grupo ou numa org sem automático, a
   * conversa cai na fila esperando gente. A pergunta é a mesma regra de quem
   * manda, aplicada ao estado que a RPC vai gravar.
   */
  const liberarDevolveAoAutomatico =
    comandoDaConversa({
      ...fatosDoComando,
      status: "open",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      assignee_kind: null,
      bot_silenced_until: conversation.last_handoff_at ? fatosDoComando.bot_silenced_until : null,
    }).comando.quem === "automatico";

  const encerrada = status === "closed" || status === "archived" || status === "resolved";
  /**
   * A VOLTA aparece sempre que há algo a devolver — inclusive em conversa
   * ENCERRADA. Antes ela era condicionada a `status !== "closed"`, e o resultado
   * era um beco sem saída medido: atendente assume, fecha, sai de férias; a
   * conversa fica com o automático parado e, para qualquer colega, sem NENHUMA
   * porta — "Liberar" só existe para o próprio dono e a rota recusa quem não é.
   * `devolverAtendimentoAoAgente` funciona nesse estado (o status fechado está na
   * lista de reativáveis), então esconder o botão escondia uma ação que existe.
   *
   * A condição é `travaVigente`, e NÃO `!automaticoAtivo`: conversa encerrada tem
   * o automático inativo sem ter trava nenhuma, e sair do segundo faria o botão
   * aparecer em toda conversa fechada — clicá-lo REABRIRIA uma conversa que
   * ninguém pediu para reabrir. Oferecer uma ação que não deveria acontecer é
   * pior que não oferecer nenhuma.
   */
  const podeDevolver = travaVigente;
  /**
   * PAUSAR só aparece quando pausar é um gesto DIFERENTE de assumir.
   *
   * Desde a 0173 "Assumir" já cala o automático (a RPC grava o silêncio). Numa
   * conversa sem dono, portanto, "Assumir" e "Pausar o automático" teriam
   * exatamente o mesmo efeito — dois botões para um ato é a confusão que esta
   * entrega existe para acabar, não para dobrar.
   *
   * Sobra o caso em que ele é próprio: a conversa JÁ tem dono e o automático
   * continua de pé. Isso é real e não é raro — o rodízio (`reason='routing'`)
   * distribui sem calar, de propósito, senão uma org em round_robin ficaria sem
   * automático nenhum.
   */
  const podePausar =
    automaticoAtivo && !encerrada && conversation.assigned_to_user_id !== null;

  if (user.support?.access_mode === "support_readonly") return <header className="flex items-center justify-between border-b p-4">
    <strong>{displayName}</strong><span className="text-sm text-muted-foreground">{STATUS_LABEL[status] ?? status} · Somente leitura</span>
  </header>;
  return (
    <>
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border bg-background px-3 py-1.5 max-md:pt-12 md:px-4 md:py-2",
        reservarDireitaFlutuante ? "md:pr-[292px]" : "md:pr-[292px] xl:pr-4",
      )}
    >
      {/* LINHA 1: Identidade do Contato à esquerda + Barra de Ações à direita (Área verde) */}
      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
        {/* Identidade */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          <ChannelLogo channel={conversation.channel_sessions} size={18} />
          <h2 className="min-w-0 truncate text-sm font-semibold" title={displayName}>{displayName}</h2>
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
            {t(STATUS_LABEL[status] ?? status)}
          </Badge>
          <JanelaSelo
            provider={conversation.channel_sessions?.provider ?? null}
            lastInboundAt={conversation.last_inbound_at}
          />
          {rotuloCanal && (
            <Badge
              variant="outline"
              className="h-4 min-w-0 max-w-[9rem] truncate px-1.5 text-[10px]"
              title={`${t("Entrou por")} ${rotuloCanal}`}
              data-testid="canal-da-conversa"
            >
              <span className="truncate">{rotuloCanal}</span>
            </Badge>
          )}
          <ConversaTagsPopover
            conversationId={conversation.id}
            orgId={conversation.organization_id}
            tags={conversation.tags}
          />
        </div>

        {/* Barra de Ações alinhada à direita no topo */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1 max-md:pr-8 max-md:[&>*]:shrink-0">
          <ConversaAcoesDoFunil
            contactId={c?.id ?? null}
            conversationId={conversation.id}
          />
          {onBuscar && (
            <Button
              ref={botaoBuscaRef}
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={onBuscar}
              aria-label={t("Buscar nesta conversa")}
              title={t("Buscar nesta conversa")}
              data-testid="buscar-na-conversa"
              aria-expanded={buscaAberta}
            >
              <MagnifyingGlass size={15} aria-hidden />
            </Button>
          )}
          <ParticipantesDaConversa
            conversationId={conversation.id}
            podeConvidar={podeConvidar}
            atendenteId={user.id}
            modo="presenca"
          />
          {podeAssumir && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs max-md:order-first"
              data-testid="acao-assumir"
              disabled={claim.isPending}
              title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
              onClick={() =>
                claim.mutate({
                  conversation_id: conversation.id,
                  expected_assignee: conversation.assigned_to_user_id,
                })
              }
            >
              {t("Assumir")}
            </Button>
          )}
          {isMineAssigned && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs max-md:order-first"
              data-testid="acao-liberar"
              disabled={release.isPending}
              title={
                liberarDevolveAoAutomatico
                  ? t("Solta esta conversa: ela fica sem dono e o atendimento automático volta a responder.")
                  : t("Solta esta conversa: ela fica sem dono e volta para a fila, esperando um atendente.")
              }
              onClick={() => release.mutate({ conversation_id: conversation.id })}
            >
              {t("Liberar")}
            </Button>
          )}
          {podeDevolver && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={retomar.isPending}
              data-testid="devolver-ao-automatico"
              title={
                motivo === "contato_travado"
                  ? t("Religa o atendimento automático para este cliente — vale para todas as conversas dele.")
                  : t("Devolve esta conversa ao atendimento automático.")
              }
              onClick={() => retomar.mutate({ conversation_id: conversation.id })}
            >
              {retomar.isPending ? t("Devolvendo...") : t("Devolver ao automático")}
            </Button>
          )}
          {!encerrada && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              data-testid="acao-transferir"
              title={t("Passa esta conversa para outro atendente. Se houver outro número conectado, dá para continuar o atendimento por ele.")}
              onClick={() => setReassignOpen(true)}
            >
              {t("Transferir")}
            </Button>
          )}
          {!encerrada && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              data-testid="acao-fechar"
              disabled={close.isPending}
              title={t("Encerra o atendimento. Depois você pode reabrir a conversa.")}
              onClick={() => {
                setDevolverAoFechar(true);
                setConfirmFecharOpen(true);
              }}
            >
              {t("Fechar")}
            </Button>
          )}
          {encerrada && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              data-testid="acao-reabrir"
              disabled={reopen.isPending}
              title={t("Reabre o atendimento desta conversa, que estava encerrada.")}
              onClick={() => reopen.mutate({ conversation_id: conversation.id, expected_revision: conversation.service_revision })}
            >
              {t("Reabrir")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label={t("Mais ações")}
                title={t("Mais ações desta conversa")}
                data-testid="menu-de-acoes"
              >
                <DotsThree size={16} weight="bold" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64" data-testid="menu-de-acoes-conteudo">
              {c?.id && (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/app/contacts/${c.id}`}
                    className="flex w-full items-center gap-2"
                    data-testid="acao-ver-contato"
                    title={t("Abre a ficha completa deste contato.")}
                  >
                    <UserCircle size={16} aria-hidden />
                    {t("Ver contato")}
                  </Link>
                </DropdownMenuItem>
              )}
              {!conversation.is_group && c?.id && (
                <DialButton contactId={c.id} hasPhone={!!c.phone_number} comoItemDeMenu />
              )}
              {podeReservar && <ItemReservarServico onSelect={() => setReservaAberta(true)} />}
              <VideoCallButton
                conversationId={conversation.id}
                provider={conversation.channel_sessions?.provider ?? null}
                lastInboundAt={conversation.last_inbound_at}
                bloqueio={motivoDoContato(c, t)}
                encerrada={status === "closed"}
                comoItemDeMenu
              />
              {podeConvidar && (
                <DropdownMenuItem
                  data-testid="convidar-participante"
                  title={t("Convida um colega para atender junto — o responsável pela conversa não muda.")}
                  onSelect={() => setConviteAberto(true)}
                >
                  <UsersThree size={16} aria-hidden className="mr-2" />
                  {t("Convidar")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {podePausar && (
                <DropdownMenuItem
                  data-testid="pausar-o-automatico"
                  disabled={pausar.isPending}
                  title={t("O atendimento automático para nesta conversa. O dono não muda.")}
                  onSelect={() => pausar.mutate({ conversation_id: conversation.id })}
                >
                  <Pause size={16} aria-hidden className="mr-2" />
                  {pausar.isPending ? t("Pausando...") : t("Pausar o automático")}
                </DropdownMenuItem>
              )}
              {!encerrada && (
                <SnoozeButton
                  conversationId={conversation.id}
                  snoozeUntil={conversation.snooze_until ?? null}
                  modo="submenu"
                />
              )}
              <DropdownMenuSeparator />
              {status !== "archived" && (
                <DropdownMenuItem
                  data-testid="acao-arquivar"
                  disabled={arquivar.isPending}
                  title={t("Guarda a conversa na aba Arquivadas. Se ainda estiver aberta, o atendimento é encerrado.")}
                  onSelect={() => setConfirmArquivarOpen(true)}
                >
                  <Archive size={16} aria-hidden className="mr-2" />
                  {arquivar.isPending ? t("Arquivando...") : t("Arquivar")}
                </DropdownMenuItem>
              )}
              {podeMarcarPessoal && c?.id && !ehPessoal && (
                <DropdownMenuItem
                  data-testid="marcar-pessoal"
                  disabled={marcarPessoal.isPending}
                  title={t("Tira este contato da operação: a conversa sai do inbox.")}
                  onSelect={() => setConfirmPessoalOpen(true)}
                >
                  <EyeSlash size={16} aria-hidden className="mr-2" />
                  {t("Marcar como pessoal")}
                </DropdownMenuItem>
              )}
              {podeMarcarPessoal && c?.id && ehPessoal && (
                <DropdownMenuItem
                  data-testid="desmarcar-pessoal"
                  disabled={desmarcarPessoal.isPending}
                  title={t("Devolve este contato à operação: a conversa volta ao inbox.")}
                  onSelect={() => desmarcarPessoal.mutate()}
                >
                  <EyeSlash size={16} aria-hidden className="mr-2" />
                  {desmarcarPessoal.isPending ? t("Desmarcando...") : t("Desmarcar pessoal")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* LINHA 2: Responsável, Telefone e Status do Automático */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <div data-testid="comando-da-conversa">
            {comando.quem === "humano" ? (
              <OwnerBadge ownerKind="user" ownerName={comando.nome ?? t("Atendente")} />
            ) : comando.quem === "automatico" ? (
              <OwnerBadge ownerKind="ai" ownerName={t("Automático")} />
            ) : (
              <OwnerBadge ownerKind={null} ownerName={null} />
            )}
          </div>
          {phone && (
            <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground max-md:hidden">
              <Phone size={11} weight="regular" aria-hidden /> {phone}
            </p>
          )}
          {endereco?.has_extras && c?.phone_number && endereco.follows_last_inbound && endereco.phone_number && (
            <p className="min-w-0 truncate text-xs text-muted-foreground max-md:hidden" data-testid="resposta-sai-por">
              {t("A resposta sai por:")} {phoneForDisplay(endereco.phone_number)}
            </p>
          )}
        </div>

        {motivo !== null && (
          <Badge
            variant="outline"
            className="h-4 w-fit max-w-full truncate px-1.5 text-[10px]"
            title={t(ROTULO_DO_MOTIVO[motivo])}
            data-testid="badge-atendimento-humano"
          >
            {t(ROTULO_DO_MOTIVO[motivo])}
          </Badge>
        )}
      </div>
    </div>
      <ReassignDialog
        conversationId={conversation.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        numero={
          onAbrirConversa && c?.id
            ? {
                contactId: c.id,
                contactPhone: c.phone_number ?? null,
                channelSessionId: conversation.channel_session_id,
                onAbrirConversa,
              }
            : undefined
        }
      />
      {/* O diálogo do convite, FORA do menu ⋯ (ver `DialogoDeConvite`): ele é
          modal, e modal dentro de modal esconde a página de quem usa leitor de
          tela. O item do menu só levanta `conviteAberto`. */}
      <DialogoDeConvite
        conversationId={conversation.id}
        aberto={conviteAberto}
        onAbertoChange={setConviteAberto}
      />
      {podeReservar && c?.id && activeOrg && (
        <ReservarServicoNaConversa
          key={`${activeOrg.orgId}:${conversation.id}`}
          contactId={c.id}
          conversationId={conversation.id}
          contactName={displayName}
          aberto={reservaAberta}
          onAbertoChange={setReservaAberta}
        />
      )}
      <AlertDialog open={confirmFecharOpen} onOpenChange={setConfirmFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* A PERGUNTA QUE FALTAVA (#3313, item 1). A trava de humano fica no
              CONTATO: fechar a conversa não a solta, e a equipe descobria isso
              dias depois, com o cliente sem resposta. Só aparece com a trava
              ligada — sem ela não há o que perguntar, e fechar continua sendo
              só fechar (nenhuma chave nova viaja no corpo).

              Rádio nativo, e não um `Switch`: as duas opções são excludentes e
              o estado atual PRECISA estar visível na abertura, que é justamente
              o que o item pede ("padrão marcado"). */}
          {contatoTravadoComEquipe ? (
            <div className="space-y-2" data-testid="escolha-ao-fechar">
              <p className="text-sm font-medium">
                {t("Este contato está com a equipe. Ao fechar, o que acontece?")}
              </p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="devolver-ao-fechar"
                  data-testid="fechar-devolver-ao-automatico"
                  checked={devolverAoFechar}
                  onChange={() => setDevolverAoFechar(true)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    {t("Devolver ao automático ao fechar")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "A IA volta a atender este cliente na próxima mensagem dele. Se o contato estiver marcado como sempre atendimento humano, ele continua com a equipe.",
                    )}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="devolver-ao-fechar"
                  data-testid="fechar-manter-com-a-equipe"
                  checked={!devolverAoFechar}
                  onChange={() => setDevolverAoFechar(false)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{t("Manter com a equipe")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "A conversa fecha e a IA continua calada para este cliente: a próxima mensagem dele espera uma pessoa.",
                    )}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // A chave só entra no corpo quando a escolha existe: sem contato
                // travado a tela não pergunta nada, e o fechamento é o de sempre.
                const escolha: {
                  conversation_id: string;
                  expected_revision?: number;
                  devolver_ao_automatico?: boolean;
                } = {
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                };
                if (contatoTravadoComEquipe) {
                  escolha.devolver_ao_automatico = devolverAoFechar;
                }
                close.mutate(escolha);
              }}
            >
              {t("Fechar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação precisa dizer o que ACONTECE, e o que acontece depende
          do estado. `fn_conversation_set_status` trata `archived` como
          terminal: encerra o atendimento (grava `service_closed_at`,
          incrementa a revisão) e, com isso, desfaz a pausa do automático. Um
          atendente que leia "arquivar = tirar da vista, volto depois"
          encerraria o atendimento sem saber — e o robô voltaria a responder
          no próximo "oi" do cliente. Por isso a descrição só aparece quando
          `!encerrada`: quando já está encerrada, arquivar não muda o
          atendimento, só o lugar onde a conversa mora. */}
      <AlertDialog open={confirmArquivarOpen} onOpenChange={setConfirmArquivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                arquivar.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação diz o que ACONTECE ao marcar: a conversa fecha e sai do
          atendente, e o contato fica inutilizado para envio — sem apagar nada.
          Desmarcar é direto no botão porque só relista o que já está lá. */}
      <AlertDialog open={confirmPessoalOpen} onOpenChange={setConfirmPessoalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Marcar este contato como pessoal?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A conversa sai do inbox e o contato fica fora da operação: sem IA, sem follow-up, sem campanha e sem envio. O histórico continua no banco e volta à vista ao desmarcar; follow-ups e campanhas cancelados não voltam.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => marcarPessoal.mutate()}>
              {t("Marcar como pessoal")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
