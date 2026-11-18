"use client";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { ORIGEM_AGENDA_DO_CELULAR } from "@/lib/leads/origem-do-contato";
import { FUSO_PADRAO } from "@/lib/tempo/fusos";
import { apiClient } from "@/lib/api/client";
import { X } from "@/lib/ui/icons";

export interface BusinessHoursValue {
  timezone: string;
  start: string;
  end: string;
  weekdays: number[];
  /**
   * Aviso de fora do horário (#1926) — texto fixo enviado NA HORA quando o
   * cliente escreve fora da janela, uma vez por contato por período fechado.
   * Ausente/vazio = sem aviso (comportamento de antes).
   */
  notice?: string | null;
}

export interface TriggerValue {
  events: ("message")[];
  filters: {
    ignore_groups: boolean;
    ignore_self: boolean;
    keyword_regex: string | null;
    business_hours: BusinessHoursValue | null;
    /**
     * PÚBLICO do agente (#3722). `include_` = só atende quem cumpre;
     * `exclude_` = não atende quem cumpre, e a exclusão vence. Opcionais na
     * INTERFACE porque draft salvo antes desta entrega não tem as chaves — a
     * tela lê com `?? []` e quem grava é o Zod (`lib/ai/agents/validation.ts`),
     * que preenche as seis.
     */
    include_tags?: string[];
    exclude_tags?: string[];
    include_pipeline_ids?: string[];
    exclude_pipeline_ids?: string[];
    /** Origem do contato (`contacts.source`) — ex.: `prospecting`, `whatsapp`. */
    include_sources?: string[];
    exclude_sources?: string[];
  };
  concurrency: "one_per_conversation" | "one_per_contact";
}

interface Props {
  value: TriggerValue;
  onChange: (v: TriggerValue) => void;
  disabled?: boolean;
  organizationTimezone?: string;
  /**
   * Os funis da organização, para o público escolher por FUNIL. Vem por prop
   * pelo mesmo motivo da marcação de escopo (já é server component na página):
   * lista vazia no primeiro render diria "nenhum funil" por engano.
   */
  funis?: readonly { id: string; name: string }[];
}

/** Etiquetas digitadas como lista: separa por vírgula, tira vazio e repetida. */
function listaDeEtiquetas(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const crua of texto.split(",")) {
    const nome = crua.trim();
    if (nome === "") continue;
    const chave = nome.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(nome);
  }
  return saida;
}

/**
 * Campo de etiquetas separadas por vírgula. O TEXTO digitado mora aqui, e a
 * lista sai para o pai a cada tecla: se o campo exibisse a lista já limpa, a
 * vírgula e o espaço do fim sumiriam no meio da digitação e "cliente ativo,
 * contrato" viraria "clienteativocontrato".
 */
function CampoDeEtiquetas({
  id,
  valor,
  onChange,
  placeholder,
  disabled,
  variante = "padrao",
}: {
  id: string;
  valor: readonly string[];
  onChange: (lista: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  variante?: "padrao" | "exclusao" | "inclusao";
}) {
  const t = useT();
  const [texto, setTexto] = React.useState(() => valor.join(", "));
  const [vocabulario, setVocabulario] = React.useState<string[]>([]);

  React.useEffect(() => {
    let montado = true;
    apiClient
      .get<{ data: string[] } | string[]>("/api/v1/conversation-tags")
      .then((res) => {
        if (!montado) return;
        const tags = Array.isArray(res)
          ? res
          : Array.isArray((res as { data?: string[] })?.data)
            ? (res as { data: string[] }).data
            : [];
        setVocabulario(tags);
      })
      .catch(() => {
        // Silencioso se rota indisponível ou teste unitário
      });
    return () => {
      montado = false;
    };
  }, []);

  const exibido =
    JSON.stringify(listaDeEtiquetas(texto)) === JSON.stringify(valor)
      ? texto
      : valor.join(", ");

  const adicionarTag = (tag: string) => {
    const limpa = tag.trim();
    if (!limpa) return;
    const tagsAtuais = listaDeEtiquetas(exibido);
    if (!tagsAtuais.some((t) => t.toLowerCase() === limpa.toLowerCase())) {
      const proximoTexto = exibido.trim() ? `${exibido.trim()}, ${limpa}` : limpa;
      setTexto(proximoTexto);
      onChange(listaDeEtiquetas(proximoTexto));
    }
  };

  const removerTag = (tagParaRemover: string) => {
    const tagsAtuais = listaDeEtiquetas(exibido);
    const filtradas = tagsAtuais.filter((t) => t.toLowerCase() !== tagParaRemover.toLowerCase());
    const proximoTexto = filtradas.join(", ");
    setTexto(proximoTexto);
    onChange(filtradas);
  };

  const tagsSelecionadas = valor.length > 0 ? valor : listaDeEtiquetas(exibido);
  const sugestoes = vocabulario.filter(
    (item) => !tagsSelecionadas.some((v) => v.toLowerCase() === item.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {/* Badges das tags já selecionadas */}
      {tagsSelecionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {tagsSelecionadas.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold shadow-xs ${
                variante === "exclusao"
                  ? "border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                  : "border border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
              }`}
            >
              <span>{tag === "*" ? t("Todas as etiquetas (*)") : tag}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removerTag(tag)}
                  className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer"
                  aria-label={`Remover ${tag}`}
                >
                  <X size={12} weight="bold" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Input de digitação (mantém compatibilidade total) */}
      <Input
        id={id}
        value={exibido}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(listaDeEtiquetas(e.target.value));
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="text-sm bg-background font-medium"
        spellCheck={false}
      />

      {/* Sugestões de clique rápido com as tags do WhatsApp e CRM */}
      {sugestoes.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("Clique rápido para adicionar tags existentes:")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {variante === "exclusao" && !tagsSelecionadas.some((t) => t === "*" || t.toLowerCase() === "todas") && (
              <button
                type="button"
                onClick={() => adicionarTag("*")}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-md border border-rose-400 bg-rose-100/80 dark:border-rose-700 dark:bg-rose-950/80 px-2 py-0.5 text-xs font-bold text-rose-900 dark:text-rose-200 hover:border-rose-500 hover:bg-rose-200 transition-all cursor-pointer"
                title={t("Bloquear qualquer conversa que possua qualquer etiqueta do WhatsApp")}
              >
                <span>🛡️ + {t("Todas as etiquetas (*)")}</span>
              </button>
            )}
            {sugestoes.slice(0, 16).map((sugestao) => (
              <button
                key={sugestao}
                type="button"
                onClick={() => adicionarTag(sugestao)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/80 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground transition-all cursor-pointer"
              >
                <span>+ {sugestao}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lista de funis com caixa de seleção — o "só estes" / "não estes" do público
 * (#3722). Sem `t()` aqui de propósito: os rótulos chegam já traduzidos de quem
 * chama, e o nome do funil é DADO do operador (não se traduz).
 */
function ListaDeFunis({
  id,
  rotulo,
  ajuda,
  funis,
  selecionados,
  onChange,
  disabled,
  variante = "inclusao",
}: {
  id: string;
  rotulo: string;
  ajuda: string;
  funis?: readonly { id: string; name: string }[];
  selecionados: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  variante?: "exclusao" | "inclusao";
}) {
  if (!funis || funis.length === 0) return null;
  const marcados = new Set(selecionados);
  return (
    <div className="space-y-1.5 pt-1" id={id}>
      <Label className="text-sm font-semibold text-foreground">{rotulo}</Label>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {funis.map((f) => {
          const marcado = marcados.has(f.id);
          const estiloMarcado =
            variante === "exclusao"
              ? "border-rose-400 bg-rose-100/90 text-rose-950 font-bold dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-100 shadow-xs"
              : "border-emerald-500 bg-emerald-100/90 text-emerald-950 font-bold dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100 shadow-xs";
          const corAccent = variante === "exclusao" ? "accent-rose-600" : "accent-emerald-600";

          return (
            <label
              key={f.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                marcado
                  ? estiloMarcado
                  : "border-border/80 bg-background text-foreground/80 hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                className={`h-4 w-4 rounded ${corAccent}`}
                checked={marcado}
                disabled={disabled}
                aria-label={f.name}
                onChange={() =>
                  onChange(
                    marcado ? selecionados.filter((x) => x !== f.id) : [...selecionados, f.id],
                  )
                }
              />
              {f.name}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  );
}

/**
 * As origens que a tela oferece: as do filtro de origem da lista de contatos
 * (`app/app/contacts/_client.tsx`) mais `prospecting`, a de quem nasce de uma
 * campanha de prospecção. Uma função com o LITERAL em cada ramo, e não uma
 * tabela `{ rotulo }`: `t()` com argumento não literal escapa do guardião de
 * espanhol (`i18n-espanhol-cobre-a-tela`).
 */
const ORIGENS_OFERECIDAS = [
  "whatsapp",
  "prospecting",
  "site",
  "meta_ads",
  "google_ads",
  "manual",
  "import_csv",
  ORIGEM_AGENDA_DO_CELULAR,
  "nuvemshop",
] as const;

function rotuloDaOrigem(source: string, t: (texto: string) => string): string {
  switch (source) {
    case "whatsapp":
      return t("Chegou pelo WhatsApp");
    case "prospecting":
      return t("Prospecção");
    case "site":
      return t("Site (landing page)");
    case "meta_ads":
      return t("Anúncio da Meta");
    case "google_ads":
      return t("Anúncio do Google");
    case "manual":
      return t("Manual");
    case "import_csv":
      return t("Importado (CSV)");
    case ORIGEM_AGENDA_DO_CELULAR:
      return t("Agenda do celular");
    case "nuvemshop":
      return "Nuvemshop";
    default:
      return source;
  }
}

/**
 * Lista de origens com caixa de seleção — o "só estas" / "não estas" do
 * público. Uma origem gravada pela API que a tela não conhece continua
 * aparecendo, marcada: escondê-la faria o próximo salvar apagá-la sem aviso.
 */
function ListaDeOrigens({
  id,
  rotulo,
  ajuda,
  selecionados,
  onChange,
  disabled,
  variante = "inclusao",
}: {
  id: string;
  rotulo: string;
  ajuda: string;
  selecionados: readonly string[];
  onChange: (origens: string[]) => void;
  disabled?: boolean;
  variante?: "exclusao" | "inclusao";
}) {
  const t = useT();
  const marcados = new Set(selecionados.map((o) => o.toLowerCase()));
  const conhecidas: readonly string[] = ORIGENS_OFERECIDAS;
  const extras = selecionados.filter((o) => !conhecidas.includes(o.toLowerCase()));
  const opcoes = [...conhecidas, ...extras];
  return (
    <div className="space-y-1.5 pt-1" id={id}>
      <Label className="text-sm font-semibold text-foreground">{rotulo}</Label>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {opcoes.map((origem) => {
          const marcado = marcados.has(origem.toLowerCase());
          const nome = rotuloDaOrigem(origem, t);
          const estiloMarcado =
            variante === "exclusao"
              ? "border-rose-400 bg-rose-100/90 text-rose-950 font-bold dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-100 shadow-xs"
              : "border-emerald-500 bg-emerald-100/90 text-emerald-950 font-bold dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100 shadow-xs";
          const corAccent = variante === "exclusao" ? "accent-rose-600" : "accent-emerald-600";

          return (
            <label
              key={origem}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                marcado
                  ? estiloMarcado
                  : "border-border/80 bg-background text-foreground/80 hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                className={`h-4 w-4 rounded ${corAccent}`}
                checked={marcado}
                disabled={disabled}
                aria-label={nome}
                onChange={() =>
                  onChange(
                    marcado
                      ? selecionados.filter((x) => x.toLowerCase() !== origem.toLowerCase())
                      : [...selecionados, origem],
                  )
                }
              />
              {nome}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  );
}

const WEEKDAYS = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
];

export function TriggerEditor({ value, onChange, disabled, organizationTimezone, funis }: Props) {
  const t = useT();
  const defaultTimezone = organizationTimezone ?? FUSO_PADRAO;

  function patchFilters(p: Partial<TriggerValue["filters"]>) {
    onChange({ ...value, filters: { ...(value?.filters ?? {}), ...p } });
  }

  const bh = value?.filters?.business_hours;

  function setBhEnabled(enabled: boolean) {
    patchFilters({
      business_hours: enabled
        ? bh ?? {
            timezone: defaultTimezone,
            start: "08:00",
            end: "20:00",
            weekdays: [1, 2, 3, 4, 5],
          }
        : null,
    });
  }

  function patchBh(p: Partial<BusinessHoursValue>) {
    if (!bh) return;
    patchFilters({ business_hours: { ...bh, ...p } });
  }

  function toggleWeekday(d: number) {
    if (!bh) return;
    const has = bh.weekdays.includes(d);
    const next = has ? bh.weekdays.filter((x) => x !== d) : [...bh.weekdays, d].sort();
    patchBh({ weekdays: next });
  }

  const safeEvents = Array.isArray(value?.events) ? value.events : ["message"];

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("O que faz ele responder")}</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(["message"] as const).map((ev) => {
            const checked = safeEvents.includes(ev);
            return (
              <label
                key={ev}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      ...value,
                      events: checked
                        ? (safeEvents.filter((e) => e !== ev) as TriggerValue["events"])
                        : ([...safeEvents, ev] as TriggerValue["events"]),
                    })
                  }
                  disabled={disabled}
                />
                {/* `message` é o nome do evento no wire; na tela vale o que ele
                    significa para quem lê. */}
                {ev === "message" ? t("Uma mensagem nova do cliente") : ev}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={value?.filters?.ignore_groups ?? true}
            onCheckedChange={(v) => patchFilters({ ignore_groups: v })}
            disabled={disabled}
            id="ignore_groups"
          />
          <Label htmlFor="ignore_groups">{t("Não responder em grupos")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={value?.filters?.ignore_self ?? true}
            onCheckedChange={(v) => patchFilters({ ignore_self: v })}
            disabled={disabled}
            id="ignore_self"
          />
          <Label htmlFor="ignore_self">{t("Não responder às mensagens que saem do seu próprio número")}</Label>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="keyword_regex">{t("Só responder quando a mensagem falar de algo específico (opcional)")}</Label>
        <Input
          id="keyword_regex"
          value={value?.filters?.keyword_regex ?? ""}
          onChange={(e) =>
            patchFilters({ keyword_regex: e.target.value.trim() === "" ? null : e.target.value })
          }
          placeholder={t("Ex.: pedido|status|orçamento")}
          disabled={disabled}
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Deixe em branco para o agente responder a tudo. Se preencher, ele só entra quando a mensagem contiver uma dessas palavras — separe por barra vertical (|). Aceita expressão regular, para quem já conhece.",
          )}
        </p>
      </div>

      {/* PÚBLICO DO AGENTE (#3722) — quem este agente atende, no MESMO número
          em que outro atende o resto. Ao lado do filtro de palavra-chave
          porque é a mesma família: uma régua de ENTRADA. A diferença é que ela
          olha o CONTATO (etiquetas e funis dos negócios abertos), não o texto
          da mensagem — é o que permite um agente de vendas e um de clientes
          dividirem o número. */}
      <div className="space-y-4 rounded-lg border border-border/80 p-4 shadow-xs">
        <div>
          <Label className="text-base font-semibold">{t("Público do agente")}</Label>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t(
              "Em branco, ele atende todo mundo. Preenchido, ele só atende quem cumpre os critérios e não possui nenhuma regra de bloqueio.",
            )}
          </p>
        </div>

        {/* ─── REGRAS DE BLOQUEIO (NÃO ATENDER) ─── */}
        <div className="space-y-4 rounded-xl border-2 border-rose-300/90 bg-rose-50/70 p-5 dark:border-rose-850 dark:bg-rose-950/30 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white font-black text-xs shadow-xs">
              ✕
            </span>
            <div>
              <h4 className="text-base font-bold text-rose-950 dark:text-rose-100">
                {t("Regras de Bloqueio (Quem o agente NÃO deve responder)")}
              </h4>
              <p className="text-xs font-medium text-rose-800/90 dark:text-rose-300">
                {t("Qualquer contato que coincidir com estas regras será barrado e atendido apenas pela equipe humana.")}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <Label htmlFor="exclude_tags" className="text-sm font-bold text-rose-950 dark:text-rose-100">
              {t("Não atender quem tem estas etiquetas")}
            </Label>
            <CampoDeEtiquetas
              id="exclude_tags"
              valor={value.filters.exclude_tags ?? []}
              onChange={(lista) => patchFilters({ exclude_tags: lista })}
              placeholder={t("Ex.: fornecedor, instalador")}
              disabled={disabled}
              variante="exclusao"
            />
          </div>

          <ListaDeFunis
            id="exclude_pipeline_ids"
            rotulo={t("Não atender quem está nestes funis")}
            ajuda={t("Estar no funil é ter um negócio ABERTO nele. Quem ainda não tem card NÃO é barrado por esta lista.")}
            funis={funis}
            selecionados={value.filters.exclude_pipeline_ids ?? []}
            onChange={(ids) => patchFilters({ exclude_pipeline_ids: ids })}
            disabled={disabled}
            variante="exclusao"
          />

          <ListaDeOrigens
            id="exclude_sources"
            rotulo={t("Não atender quem chegou por estas origens")}
            ajuda={t("Ex.: marque Prospecção para que as respostas de uma campanha fiquem com o agente que fez a abordagem.")}
            selecionados={value.filters.exclude_sources ?? []}
            onChange={(origens) => patchFilters({ exclude_sources: origens })}
            disabled={disabled}
            variante="exclusao"
          />
        </div>

        {/* ─── REGRAS DE ATENDIMENTO (ATENDER SÓ QUEM) ─── */}
        <div className="space-y-4 rounded-xl border-2 border-emerald-300/90 bg-emerald-50/70 p-5 dark:border-emerald-850 dark:bg-emerald-950/30 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-black text-xs shadow-xs">
              ✓
            </span>
            <div>
              <h4 className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                {t("Regras de Atendimento (Atender SOMENTE quem cumprir estes critérios)")}
              </h4>
              <p className="text-xs font-medium text-emerald-800/90 dark:text-emerald-300">
                {t("Deixe tudo desmarcado para que qualquer contato geral possa ser atendido normalmente.")}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <Label htmlFor="include_tags" className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
              {t("Atender só quem tem estas etiquetas")}
            </Label>
            <CampoDeEtiquetas
              id="include_tags"
              valor={value.filters.include_tags ?? []}
              onChange={(lista) => patchFilters({ include_tags: lista })}
              placeholder={t("Ex.: cliente ativo, contrato")}
              disabled={disabled}
              variante="inclusao"
            />
          </div>

          <ListaDeFunis
            id="include_pipeline_ids"
            rotulo={t("Atender só quem está nestes funis")}
            ajuda={t("Estar no funil é ter um negócio ABERTO nele. Quem ainda não tem card não entra em \"só estes funis\".")}
            funis={funis}
            selecionados={value.filters.include_pipeline_ids ?? []}
            onChange={(ids) => patchFilters({ include_pipeline_ids: ids })}
            disabled={disabled}
            variante="inclusao"
          />

          <ListaDeOrigens
            id="include_sources"
            rotulo={t("Atender só quem chegou por estas origens")}
            ajuda={t("A origem é por onde o contato entrou no CRM. Em branco, qualquer origem serve.")}
            selecionados={value.filters.include_sources ?? []}
            onChange={(origens) => patchFilters({ include_sources: origens })}
            disabled={disabled}
            variante="inclusao"
          />
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          {t(
            "Com dois agentes neste número, atende o primeiro na ordem de prioridade que aceita o contato. Se nenhum aceitar, o sistema não responde: a mensagem fica na caixa de entrada para uma pessoa.",
          )}
        </p>
      </div>

      <div className="space-y-1">
        <Label>{t("Quantos atendimentos ao mesmo tempo")}</Label>
        <Select
          value={value.concurrency}
          onValueChange={(v) => onChange({ ...value, concurrency: v as TriggerValue["concurrency"] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one_per_conversation">{t("Um de cada vez por conversa")}</SelectItem>
            <SelectItem value="one_per_contact">{t("Um de cada vez por cliente")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 rounded-md border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!bh}
            onCheckedChange={setBhEnabled}
            disabled={disabled}
            id="bh_enabled"
          />
          <Label htmlFor="bh_enabled">{t("Só atender em horário de funcionamento")}</Label>
        </div>
        {bh ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="bh_tz">{t("Fuso horário")}</Label>
                <Input
                  id="bh_tz"
                  value={bh.timezone}
                  onChange={(e) => patchBh({ timezone: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bh_start">{t("Início")}</Label>
                <Input
                  id="bh_start"
                  type="time"
                  value={bh.start}
                  onChange={(e) => patchBh({ start: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bh_end">{t("Fim")}</Label>
                <Input
                  id="bh_end"
                  type="time"
                  value={bh.end}
                  onChange={(e) => patchBh({ end: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1 block">{t("Dias")}</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => {
                  const active = bh.weekdays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleWeekday(d.id)}
                      disabled={disabled}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {t(d.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bh_notice">{t("Mensagem fora do horário (opcional)")}</Label>
              <Textarea
                id="bh_notice"
                rows={3}
                maxLength={1000}
                value={bh.notice ?? ""}
                onChange={(e) => patchBh({ notice: e.target.value })}
                disabled={disabled}
                placeholder={t(
                  "Ex.: Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Recebemos sua mensagem e respondemos no próximo horário de atendimento.",
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Quando o cliente escrever fora do horário, esta mensagem é enviada na hora — uma vez por cliente por período fechado, e nunca para quem pediu para parar. Deixe em branco para não enviar.",
                )}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
