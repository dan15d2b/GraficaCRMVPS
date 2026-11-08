# GráficaCRM — Relatório da FASE 1 (Auditoria do DeskcommCRM)

**Auditor:** Arquitetura/Engenharia técnica do projeto GráficaCRM
**Data:** 08/11/2026
**Alvo:** `C:\Users\brito\Desktop\DeskcommCRM-main` (cópia do repositório `melgarafael/DeskcommCRM`, branch `main`, ZIP baixado em 08/11/2026)
**Natureza da auditoria:** read-only. Nenhum arquivo do projeto original foi alterado, criado ou removido.
**Status:** FASE 1 concluída — aguardando aprovação para a FASE 2 (inventário) e FASE 3 (arquitetura).

---

## 0. Como esta auditoria foi feita (para você saber o que está provado e o que é inferência)

Não li o README e tirei conclusões dele. Li código, schema, migrations, compose, instaladores e configuração de CI. Onde um número é medido, ele leva o número; onde é estimativa, está escrito "estimado".

O que foi **medido diretamente**:

| Medida | Valor |
|---|---|
| Arquivos no repositório (sem `node_modules`/`.git`) | 10.949 |
| Tamanho em disco | 232 MB |
| Linhas de TS/TSX em `app/` | ~313.900 (1.623 arquivos) |
| Linhas de TS/TSX em `lib/` | ~512.900 (2.426 arquivos) |
| Linhas de TS/TSX em `components/` | ~88.100 (431 arquivos) |
| Linhas de TS/TSX em `workers/` | ~11.000 (43 arquivos) |
| Linhas de testes em `tests/` | ~651.500 (3.072 arquivos) |
| Route Handlers (`app/api/**/route.ts`) | 553 |
| Server Actions (`app/actions/**`) | 110 |
| Specs E2E Playwright | 219 |
| Arquivos de teste (unit + invariantes + journey) | 3.975 |
| Migrations SQL versionadas | 662 |
| Tabelas no schema | 237 |
| Policies RLS no baseline | 37 (grep literal — ver ressalva §9.3) |
| Variáveis de ambiente documentadas em `.env.example` | 134 |
| Endpoints de cron | 48 |
| Serviços no `docker-compose.prod.yml` | 10 (app, worker, scheduler, waha, waha-data, waha-media, redis, srh, caddy, wacalls, asterisk, voice-agent) |

**A primeira conclusão da auditoria não é técnica, é de escala:** isto não é um CRM pequeno com umas telas de WhatsApp. É um produto com cerca de **1 milhão de linhas** de código e teste, dezoito meses de desenvolvimento incremental, um doutrinário próprio de engenharia (o `CLAUDE.md` tem 67 mil caracteres de regra não-negociável) e uma matriz de garantias de banco (RLS, idempotência, auditoria append-only, invariantes de schema). Qualquer plano que trate isso como "adaptar um sistema" vai falhar no primeiro mês. O plano correto trata isso como **fork de produto com governança própria** — e é o que vou propor na FASE 3.

Isto muda uma premissa do seu briefing, e prefiro dizer agora: existem funcionalidades de catálogo, de funil configurável, de follow-up com motor de fluxo e de kanban já implementadas, e algumas delas se aproximam do que o briefing pede como "nova funcionalidade". O trabalho real não é construir do zero — é **estender, no lugar certo, sem quebrar o que já existe**. Detalho isso na §5.

---

## 1. Diagnóstico geral

**O que é o sistema hoje.** Um SaaS multi-tenant self-hosted de vendas e atendimento, com WhatsApp como canal principal, agentes de IA nativos operando o funil junto com humanos, e uma camada de plataforma (auth, RBAC, auditoria, LGPD, cobrança, extensões) mais madura do que a média dos CRMs open source. A arquitetura é monolito Next.js full-stack (UI e API no mesmo processo) sobre Postgres/Supabase, com workers separados consumindo uma fila de eventos em banco.

**Maturidade.** Alta, e verificável: 662 migrations versionadas com apêndice idempotente no baseline self-host, 3.975 arquivos de teste, 5 checks obrigatórios de CI, regra explícita de que trigger de banco nunca faz HTTP, teste de isolamento RLS entre duas organizações rodando no CI. O projeto tem dívida — e a documentação interna a declara item por item — mas a dívida está **nomeada**, o que é a diferença entre um sistema que envelhece e um que apodrece.

**Adequação ao seu objetivo.** O sistema é funcionalmente rico e arquiteturalmente sólido, mas foi construído para **ser um site acessado por navegador em uma VPS**, com decisões que amarram a experiência ao navegador: cookie de sessão `SameSite=Strict`, `NEXT_PUBLIC_APP_URL` como URL absoluta do app, Realtime por WebSocket do Supabase, download de PDF gerado no servidor via `@react-pdf/renderer`, e um PWA já existente (`app/manifest.ts`, `lib/pwa/`) que é, na prática, a "instalação" que o produto suporta hoje.

**Veredito da FASE 1:** viável transformar em aplicativo desktop Windows **sem reescrever**, mantendo o backend na VPS. Mas a transformação desktop precisa ser tratada como uma **camada nova de distribuição** (shell + autenticação + atualização), não como "empacotar o site". A §8 explica por quê — e o detalhe que decide a arquitetura é o cookie `SameSite=Strict`.

---

## 2. Arquitetura encontrada

### 2.1 Camadas

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVEGADOR / PWA (hoje)                                          │
│  Next.js 16 App Router · React 19 · Server Components            │
│  Tailwind 4 (CSS-first, sem tailwind.config) · shadcn/ui new-york │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS + cookie sb-deskcomm-auth (SameSite=Strict)
┌───────────────────────────▼──────────────────────────────────────┐
│  APP (containêres) — Next.js standalone                         │
│  proxy.ts (borda: request-id, x-pathname, valida sessão)         │
│  553 Route Handlers /api/** · 110 Server Actions                 │
│  lib/* — regra de negócio pura, testável                          │
└───────┬───────────────────────────┬──────────────────────────────┘
        │                           │
┌───────▼────────────┐   ┌──────────▼───────────────────────────────┐
│ Supabase (Postgres │   │ event_log (tabela-fila)                  │
│ + Auth + Realtime  │   │  ▲ triggers (nunca HTTP)                 │
│ + Storage + pgvec) │   │  │                                       │
│ RLS por organization_id │  └── workers/ (ai-response, ai-sentiment,│
└────────────────────┘   │      rag-indexer, media-*, lgpd-*)       │
                         │  ▲ 48 endpoints de cron em /api/v1/cron  │
                         └──┴────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│ INTEGRAÇÕES                                                     │
│ WAHA Plus (NOWEB) · Meta Cloud API · Nuvemshop · Google Agenda   │
│ Meta/Google Ads · Asterisk/VoIP · Redis (rate limit)             │
│ Vercel AI Gateway (Anthropic/OpenAI/Google/OpenRouter/Requesty)  │
│ Resend (e-mail) · Sentry · MCP servers por agente                │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Estrutura de diretórios (o que importa)

| Path | Conteúdo |
|---|---|
| `app/` | Rotas Next (App Router). `app/app/*` é a área autenticada (inbox, kanban, pipelines, products, metrics, team, settings, LGPD…). `app/admin/*` é o super-admin de plataforma. `app/(public)/*` é login/signup. `app/api/v1/*` é a API REST. |
| `components/` | 28 domínios de componente. `components/inbox` é o coração da operação (inbox de 3 painéis, composer, painel CRM lateral). |
| `lib/` | ~110 domínios de regra de negócio. Destaques: `agent-engine/` (turno do agente), `followup/` (motor de fluxo + follow-up), `channels/` (adapters WAHA/Meta/social), `catalogo/`, `kanban/`, `metrics/`, `propostas/`, `financeiro/`, `lgpd/`, `auth/`, `api/`, `mcp/`. |
| `workers/` | 9 workers standalone (processo próprio, não Next). |
| `supabase/migrations/` | 662 migrations + `baseline.sql` (78.372 linhas) que é o artefato que o self-host realmente aplica. |
| `hostgator-setup-kit/` | Instalador de VPS (bash). `install.sh`, `update.sh`, `agent.sh`, `backup.sh`, `preflight-upgrade.sh`. |
| `docker-compose.prod.yml` | 11 serviços. É o contrato de implantação real. |
| `docs/` | ~150 documentos: PRDs, specs, regras de negócio, doutrinas, runbooks, ADRs. |
| `tests/` | unit, e2e (Playwright), invariants (Postgres real), journeys. |

### 2.3 Multi-tenancy

Modelo clássico e bem executado: `organization_id uuid not null` em toda tabela tenant-aware, RLS via `fn_user_org_ids()`, 4 papéis (`viewer < agent < manager < admin`) e super-admin de plataforma transversal (`platform_admins.is_platform_admin`). O `CLAUDE.md` documenta o buraco clássico — service role bypassa RLS, portanto todo handler com admin client filtra `organization_id` manualmente, sempre resolvido de cookie/JWT/webhook secret, **nunca do body**.

**Para o GráficaCRM isto é ouro**: você pode vender uma instalação para a gráfica e ela nasce com isolamento já testado. Mas também é uma responsabilidade: **toda tabela nova que criarmos (produção, orçamento, catálogo de materiais) precisa nascer com `organization_id` + policy + teste de isolamento**, senão introduzimos o primeiro vazamento de dados da história do produto.

---

## 3. Tecnologias utilizadas

| Camada | Tecnologia | Versão (declarada) |
|---|---|---|
| Frontend | Next.js (App Router, Turbopack) | `^16.4.3` |
| UI | React | `^19.3.1` |
| Linguagem | TypeScript estrito | `^6.0.3` |
| Estilo | Tailwind CSS v4 (**CSS-first, não existe `tailwind.config.ts`**) | `^4.3.3` |
| Componentes | shadcn/ui (new-york, neutral) + Radix | — |
| Ícones | lucide-react, phosphor | — |
| DnD (kanban) | `@hello-pangea/dnd` | `^18.0.1` |
| Grafos (fluxos) | `@xyflow/react` | `^12.12.0` |
| Gráficos | Recharts | `^3.10.1` |
| Dados no cliente | TanStack Query + Virtual | `^5.105.0` |
| Formulários | react-hook-form + zod | `^7.91`, `^4.6.7` |
| PDF | `@react-pdf/renderer` | `^4.9.0` |
| Banco | Supabase Postgres (+ `vector`) | — |
| Auth | Supabase Auth via `@supabase/ssr` | `^0.12.7` |
| Realtime | Supabase Realtime (`postgres_changes` + `broadcast`) | — |
| Storage | Supabase Storage (bucket privado + URL assinada) | — |
| IA | Vercel AI SDK v7 (`@ai-sdk/anthropic/openai/google`) | `ai ^7.0.156` |
| Rate limit | Upstash Redis (fallback in-memory) | `^1.40.0` |
| Validação | Zod | `^4.6.7` |
| E-mail | Resend, Nodemailer | — |
| Observabilidade | Sentry (`beforeSend` scrubbing de PII) | `^11` |
| Push | web-push | `^3.6.7` |
| Testes | Vitest, Playwright, axe-core | `^4.1`, `^1.64` |
| Node | 22 (`.nvmrc`) | `>=22` |
| Gerenciador | pnpm | `9.15.9` |
| Deploy | Docker Compose + Caddy/Traefik/Cloudflare Tunnel | — |
| Build local | Supabase CLI (pg15) | — |

**Licença:** MIT, `Copyright (c) 2026 Rafael Melgaço`. Isto é importante e favorável: fork comercial é permitido, **desde que o aviso de copyright original seja preservado** na distribuição. O GráficaCRM pode ser proprietário, mas o `LICENSE` do upstream tem de ir junto no código-fonte distribuído — e, se o aplicativo desktop for distribuído como binário fechado, a obrigação prática é incluir o aviso. Registro isso como obrigação jurídica a resolver antes da primeira venda, não como detalhe.

---

## 4. Funcionalidades identificadas

Mapeamento por área, do que existe de fato no código. **A lista completa, função por função, com arquivos e integrações, é o entregável da FASE 2** — aqui está o inventário de superfície, que é o que sustenta as decisões arquiteturais.

### 4.1 Atendimento (inbox)

- Inbox de 3 painéis (lista de conversas, thread, painel CRM lateral) com tempo real.
- Atribuição e transferência de conversa, com histórico (`conversation_assignment_events`), rodízio e setores (`attendant_sectors`, `automation_rodizio_atribuicoes`).
- Notas internas, menções, rascunhos (`conversation_drafts`), etiquetas de conversa e de contato.
- Envio de texto, mídia, áudio, cartão de contato, localização, template Meta.
- Ações em lote, atalhos de teclado, filtros salvos.
- Central de avisos operacionais (`agent_inbox_items`: mensagem travada, canal mudo, espera esquecida).
- Radar (conversas esfriando), snooze, retomada.
- Pausa de automação por intervenção humana.

### 4.2 CRM

- Funis configuráveis (`crm_pipelines` com `vocabulary` jsonb para renomear lead/deal/won/lost por nicho), etapas (`crm_stages` com `is_won`, `is_lost`, `requires_human`, `expected_duration_hours`, `position` numérica com fractional indexing).
- Kanban com drag-and-drop, filtros, recorte de encerrados, score, marcadores, anexos no cartão, tarefas no quadro.
- Leads com `custom_fields` (schema declarativo por pipeline), tags com índice GIN, valor em centavos, moeda, dono, SLA de fechamento.
- Atividades polimórficas como timeline, vínculos polimórficos.
- Contatos (pessoas físicas e empresas), telefones normalizados E.164, propostas de campo com aprovação humana (`contact_field_proposals`), merge de contatos, avatares.
- Propostas comerciais (`crm_proposals`, `crm_proposal_items`, PDF, templates, aceite, expiração, régua de follow-up da proposta).
- Tarefas (`crm_tasks`), agenda (módulo completo de calendário com Google Calendar sync, tipos de evento, profissionais, recursos, lista de espera).
- Metas (`crm_metas`), previsão (`metrics/PrevisaoPanel`).

### 4.3 Agente de IA

Muito mais profundo do que o briefing pressupõe. Existe:

- **Agentes versionados** (`ai_agents`, `ai_agent_versions`, `ai_agent_version_channels`) com prompt de sistema, guardrails jsonb, modelo, `operation_mode`, publicação e rollback.
- **Turno de atendimento** (`lib/agent-engine/agent/inbound-turn.ts`) com: classificação de intenção, decisão de ação, draft de resposta, entrega de capacidade, espera de mídia, atraso humano (humanização), abertura, handoff IA→humano por sentimento e por gatilho, verificação de elegibilidade, taxa de resposta.
- **RAG por tenant** (`ai_knowledge_sources`, `ai_knowledge_versions`, `ai_chunks` com pgvector, indexer worker).
- **Memória da organização** (`org_memory_entries`, versionada).
- **Skills** instaláveis (`skill_versions`, `skill_activations`).
- **Casos** (`agent_cases`, `agent_case_events`) — a IA opera um caso, não só responde.
- **Roteadores** (`ai_routers`, `ai_router_members`, `ai_router_decisions`) — decide qual agente atende.
- **MCP server interno** e **MCP por agente/contato** (OAuth por contato).
- **Budget e custo** (`ai_budgets`, `ai_invocations`, `llm_calls`, `ai_pricing`, custo escalonado).
- **Guardrails before-send** (`before_send_traces`), opt-out compartilhado entre ingestão e runtime (`lib/opt-out/deteccao.ts`).
- **Flywheel** (destilação de melhores respostas com gate humano), **golden candidates**, **judge**.
- **Preview de resposta** sem envio, com explicação do que barraria.

### 4.4 Follow-ups e automações

- **Motor de fluxo versionado** (`followup_flow_versions`, `followup_flow_pointers`, `followup_enrollments`, `followup_enrollment_events`) com nós de tipo `trigger`, `wait` (fixa ou *smart*, planejada pela IA), `condition`, `ai_classify`, `match_reply`, `repeat`, `collect`, `skill`, `action`, `internal_task`, `move_lead`, `edit_lead_tag`, `end` — e arestas com branch/fallback.
- Gatilhos por etapa (`gatilho-etapa.ts`), por lead (`gatilho-lead.ts`), por caso, por retorno, por presença.
- Envio com janela de horário (`janela-de-disparo.ts`), pacing, throttle anti-ban, `silence-sweep` (o que fazer quando o cliente some), intervenção e reentrada, no-show, recuperação esgotada.
- **Automações QUANDO/SE/ENTÃO** (`automation_rules`, `automation_rule_runs`) com `apply-proposal`.
- **Cadências de e-mail** (`email_cadences`, enrollments, events, supressões) e **campanhas** (`campaigns`, recipients, supressões, templates).

### 4.5 Canais

- **WAHA Plus** (engine NOWEB), multi-sessão, QR, pairing code, health por sessão, warm-up, grupos ligados por sessão, webhook HMAC-SHA512 com `timingSafeEqual`.
- **Meta Cloud API** (canal oficial) com templates, sessões, status.
- **Canal social** (adapters `datafy`, `zernio`, `social/`).
- **Nuvemshop** (produtos, pedidos, webhooks LGPD).
- **VoIP** (Asterisk) e **voice-agent**.
- **Webhooks de saída** com assinatura, replay, retenção de log.
- **Fontes externas de banco** (`external_db_connections` — leitura de MySQL/Postgres do cliente, com introspecção, limites e guardas). Ou seja: **já existe integração com banco externo**, o que é extremamente relevante para uma gráfica que já usa outro ERP.

### 4.6 Plataforma e administração

Auth (MFA TOTP opcional por política, códigos de recuperação, sessões, impersonação auditada com suporte temporário), RBAC, audit log append-only com retenção de 5 anos executada por função `security definer`, LGPD (pedido, export, redact, anonimização em cascata), API v1 REST com auth dual (cookie + Bearer `dsk_`), API tokens, idempotência por Postgres, rate limit, marca própria white-label (`platform_branding`, `organizations.settings.branding`), **extensões declarativas** (pacotes de módulo instaláveis em runtime), onboarding por nicho com **sugestão de funil por IA** e pacotes prontos (`lib/onboarding/pacotes-de-funil.ts`), cobrança (planos, Stripe/Asaas), PWA, i18n (pt/en/es).

### 4.7 O que o briefing pede e **já existe** (em alguma forma)

Isto é o achado mais importante desta auditoria para o planejamento. Tenho de ser direto porque muda o custo do projeto:

| Pedido no briefing | O que já existe | Distância real |
|---|---|---|
| Dashboard de produção | `app/app/metrics` (funil, atrito, série temporal, previsão, perdas, taxa e tempo por etapa, valores do período), `app/app/painel` (painel de atendimento), `lib/metrics/*` | Não há **nenhum indicador de produção gráfica** (etapas de produção, pedido atrasado, responsável de produção, tempo entre pedido e conclusão). É um módulo novo, mas que deve **reusar** `lib/metrics` e não duplicar séries. |
| Kanban de produção | `app/app/kanban` + `lib/kanban/*` com DnD, fractional indexing, realtime, echo local otimista, filtros | O quadro existe e é bom. Falta o **cartão de pedido gráfico** (prazo, produto, especificação, responsável de produção) e o vínculo com status de produção. |
| Catálogo de produtos e serviços | `catalog_products` (`codigo`, `nome`, `descricao`, `marca`, `categoria`, `preco_cents`, `custo_cents`, `moeda`, `fotos`, `ativo`, `quantidade`, `controla_estoque`, `origem`), import de planilha, busca com paginação, **apresentação do produto por IA no WhatsApp** (`catalog_product_presentations`, texto + áudio + fotos, `show_price`) | Existe e é sofisticado. **Mas `preco_cents` é `not null` na tabela e obrigatório no Zod (`lib/schemas/produtos.ts:154`)** — o briefing pede preço **opcional**. E faltam: dimensões, material, acabamento, variações, prazo de produção, especificações técnicas. É **evolução de schema + UI**, não módulo novo. |
| Funil de 8 etapas com integração na conversa | `crm_pipelines`/`crm_stages` configuráveis; `vocabulary`; pacotes de onboarding (clínica, imobiliária, curso, loja, serviços, genérico); mudança de etapa dentro da conversa já existe (painel CRM lateral, `move_lead_stage`, `lib/atendimento`, `lib/followup/atendimento.ts`) | Falta o **pacote "gráfica" de 8 etapas** e a semântica de cada etapa (ex.: `Pronto para entrega/instalação` = etapa **sem automação**, que o motor hoje não representa de forma declarativa — `requires_human` é o mais próximo). É **configuração + semântica**, com uma coluna nova. |
| Follow-ups 1 / 5 / 30 dias a partir do envio do orçamento | Motor de fluxo com `wait` em duração fixa e `smart`, enrollment por evento, `followup_enrollment_events`, cancelamento por motivo, janela de horário, pacing | O motor é mais poderoso que o pedido. O que **não** existe é o **evento "orçamento enviado" com timestamp próprio** disparando a cadeia, e a **ação na conversa** que o marca. É um fluxo + uma ação + uma coluna de data. |
| Envio automático "pronto para retirada" | `enviar-texto-fixo`, templates, mensagens configuráveis | Pode ser feito como nó `action` de fluxo. É configuração + um gatilho de etapa. |
| App desktop Windows | **PWA** (`app/manifest.ts`, `lib/pwa/`, modo `standalone`) — não é app instalável nativo | É a lacuna **real e maior** do briefing. Nada de Electron/Tauri existe. |

**Consequência para o planejamento:** o projeto não é "reconstruir um CRM com funcionalidades novas". É (a) construir uma **camada de distribuição desktop** que hoje não existe, (b) **especializar** um produto multi-nicho para o nicho gráfico via configuração + extensões de schema, e (c) **preservar** um sistema de ~1M de linhas que já funciona. Estimar isso como "semanas" seria desonesto.

### 4.8 O que **não** existe e é trabalho genuinamente novo

1. Shell desktop nativo, instalador MSI/EXE, assinatura de código, auto-update.
2. Estratégia de autenticação compatível com app desktop (o cookie `SameSite=Strict` foi desenhado para navegador).
3. Módulo de **ordem de produção** como entidade de primeira classe (hoje "pedido" é `crm_lead` com valor + `sales`/`sale_items`/`crm_proposals` ao redor; não há entidade "ordem de serviço gráfico" com etapas de produção, responsável, prazo, checklist, arte/faca/prova).
4. **Especificação técnica de produto** (dimensão, material, acabamento, quantidade → cálculo) e orçamentação por composição.
5. **Etapa sem automação** como conceito declarativo no motor de follow-up.
6. Indicadores de produção (atraso, tempo por etapa de produção, produtividade por funcionário).
7. Identidade visual GráficaCRM.

---

## 5. Integrações existentes

| Integração | Papel | Onde vive | Obrigatória? |
|---|---|---|---|
| **Supabase** (Postgres/Auth/Realtime/Storage) | Tudo | `lib/supabase/*` | Sim — sem ela o app não sobe |
| **WAHA Plus** (NOWEB) | WhatsApp não oficial: sessões, QR, envio, recebimento, mídia, grupos | `lib/waha/`, `lib/channels/adapters/waha.ts` | Sim em produção |
| **Meta Cloud API** | WhatsApp oficial: templates, sessões, status | `lib/channels/meta/` | Não (alternativa) |
| **Canal social** (datafy/zernio) | Ingestão de redes sociais | `lib/channels/social/`, `adapters/` | Não |
| **Vercel AI Gateway** + Anthropic/OpenAI/Google/OpenRouter/Requesty | LLM, embeddings | `lib/ai/`, `lib/ai/credenciais/` | Sim para IA |
| **Upstash Redis** | Rate limit, debounce de RAG | `lib/ai/dispatcher/rate-limit.ts` | Não (degrada) |
| **Resend / SMTP** | E-mail transacional | `lib/email/` | Não |
| **Nuvemshop** | E-commerce | `lib/nuvemshop/` | Não |
| **Google Calendar** | Agenda | `calendar_*` | Não |
| **Meta Ads / Google Ads** | Atribuição de anúncio, conversões | `lib/plataformas-de-anuncio/`, `meta_*`, `google_ads_*` | Não |
| **Stripe / Asaas** | Cobrança | `lib/cobranca/` | Não |
| **Asterisk / VoIP / voice-agent** | Telefonia | `asterisk/`, `workers/voice-agent` | Não |
| **Sentry** | Erros | `sentry.*.config.ts` | Não |
| **MCP (como servidor e como cliente)** | CRM exposto a agentes; agentes consumindo MCP externo | `app/api/mcp/`, `lib/mcp/`, `lib/ai/skills/` | Não |
| **Banco externo do cliente** (MySQL/Postgres) | Leitura de dados do ERP do cliente | `lib/external-db/` | Não — **mas é a ponte mais valiosa para o nicho gráfico** |

---

## 6. Pontos fortes

1. **Isolamento multi-tenant levado a sério.** RLS + teste de isolamento no CI + regra explícita de filtro manual com service role. Um fork que preserve isso herda uma garantia que a maioria dos CRMs comerciais pequenos não tem.
2. **Audit log append-only de verdade.** Não é log de aplicação: as permissões de `api_audit_log` foram revogadas dos papéis do PostgREST, e há teste de invariante que prova isso sob o default ACL do Supabase. Auditoria é requisito comercial em gráfica (rastrear quem mudou prazo e preço).
3. **Motor de follow-up declarativo e versionado**, com nós tipados, plano de tempo auditável, janelas de envio, pacing anti-ban e idempotência. O briefing pede 3 follow-ups; o motor entrega qualquer cadeia, com histórico.
4. **Integração de conversa ↔ funil já existe.** O painel CRM lateral (`components/inbox/CRMSidePanel.tsx`) é exatamente o "mudar etapa dentro da conversa" que o briefing pede. Isso remove o maior risco de UX do projeto.
5. **Arquitetura de eventos correta** (`event_log` + workers + cron), com a regra "trigger nunca faz HTTP" — a decisão que evita o problema clássico de transação esperando rede.
6. **Disciplina de migrations para self-host.** Migrations versionadas **e** apêndice idempotente no baseline. Isso é o que permite atualizar a instalação de um cliente sem downtime destrutivo — requisito direto do seu "sem perda de informação".
7. **White-label e extensões declarativas já existentes.** A marca é resolvida no banco (`platform_branding`), não em env nem em imagem. O GráficaCRM nasce como "marca própria" sem precisar construir essa camada — e as extensões permitem empacotar o nicho gráfico como módulo instalável em vez de hardcode no núcleo.
8. **Qualidade de código mensurável:** `CLAUDE.md` como doutrina, proibição de `console.log` em produção, logger estruturado, Zod em todo input externo, `ok()/fail()` canônicos, `X-Request-Id` correlacionado.
9. **Canal oficial Meta além do WAHA.** O risco de banimento do WhatsApp não oficial — o maior risco operacional de um CRM de gráfica — tem caminho de mitigação já implementado.
10. **`external_db_connections`.** Ler o ERP/banco da gráfica é o que permite o GráficaCRM conviver com o que a gráfica já usa em vez de exigir migração de tudo.

---

## 7. Problemas encontrados

### 7.1 Bloqueantes para o objetivo (desktop)

**P1 — O cookie de sessão é `SameSite=Strict`.** `proxy.ts:97`, `lib/supabase/browser.ts:145`. Em navegador isso é a escolha correta (CSRF). Em um app desktop que carrega a UI de outra origem (`tauri://localhost`, `file://` ou `http://localhost:1420`), `SameSite=Strict` **não envia o cookie em requisições cross-site** — o app autenticaria e imediatamente desautenticaria. Este é o ponto que decide a arquitetura desktop (§8) e não pode ser contornado com "só abrir a URL no webview": se o webview aponta para o domínio da VPS, o cookie funciona, mas aí o app **é** um navegador embrulhado — exatamente o que você recusou.

**P2 — `NEXT_PUBLIC_APP_URL` acopla o app à URL absoluta do servidor.** Usado em links de convite, callback de OAuth, retornos de cobrança, e-mail. Um cliente desktop não tem "a URL do app" — tem "o endereço da minha instalação". Sem um modelo de "endpoint configurável por instalação", o app desktop não se conecta a VPSs diferentes.

**P3 — Ausência de `Content-Security-Policy` observada no `proxy.ts`.** Há `X-Request-Id`, `x-pathname`, controle de CSS; não localizei CSP na borda. Para webview desktop isso importa mais que no navegador (o shell tem privilégios). Precisa ser verificado com cuidado e, se ausente, adicionado **antes** de embarcar qualquer webview.

**P4 — Realtime por WebSocket do Supabase** é usado para inbox e kanban. Não é bloqueante (WebSocket funciona em qualquer shell), mas define que **o app desktop é online-first**: sem internet, a operação para. Isso contradiz parcialmente "usar diariamente sem problemas de sincronização" se a gráfica tiver internet instável. Precisa ser decisão explícita do produto (§8.4).

### 7.2 Funcionais em relação ao briefing

**P5 — `preco_cents` é obrigatório no catálogo.** `catalog_products.preco_cents` `not null`; `lib/schemas/produtos.ts:154` exige número. O briefing exige preço **opcional**. Correção: `alter column preco_cents drop not null` + Zod opcional + UI + o agente informando "é necessário solicitar orçamento". É migration simples, mas toca: import de planilha, apresentação do produto (`show_price`), proposta comercial (que calcula item × preço) e o prompt do agente. **Não é mudança de uma linha.**

**P6 — O catálogo não tem especificação técnica.** Sem dimensão, material, acabamento, variações, prazo de produção. Sem isso, o agente de IA não pode "coletar dimensões e acabamento" como o briefing exige, e não há como orçar por composição. É **schema novo** (`catalog_product_specs` ou `jsonb` com schema declarativo — decidir na FASE 3) e afeta produto, import, busca, apresentação e IA.

**P7 — Nenhuma entidade "ordem de produção".** O sistema trata o negócio como `crm_lead` com `value_cents` e etapas. Não há onde guardar prazo de produção, responsável de produção, arte aprovada, prova, faca, quantidade produzida, retrabalho, entrega/instalação, checklist. Construir isso em `crm_leads.custom_fields` seria o anti-pattern que o próprio `CLAUDE.md` proíbe (jsonb lock-in, campo sem FK). **É a maior peça de modelagem nova do projeto.**

**P8 — `Pronto para entrega/instalação` não tem representação declarativa "sem automação".** Existe `crm_stages.requires_human` (informativo) e existem guardas no runtime do agente, mas não há um atributo de etapa que diga "o motor de follow-up não dispara nada aqui". O briefing é explícito sobre isso. Solução provável: coluna nova em `crm_stages` + leitura no motor + teste. Detalhar na FASE 3.

**P9 — Não há evento de domínio "orçamento enviado".** O timestamp que o briefing exige ("data e hora reais do envio") não existe como coluna/fato. Hoje há `crm_proposals` com ciclo próprio (enviada/aceita/expirada), mas o pedido é **a ação na conversa que marca o envio e dispara a cadeia**. Criar isso é: ação na UI, endpoint/action, coluna ou evento, gatilho do fluxo. E precisa de **idempotência** — enviar duas vezes o mesmo orçamento não pode disparar duas cadeias.

### 7.3 Escala, manutenção e governança

**P10 — Tamanho do fork.** 1M de linhas e 662 migrations significam que cada upgrade do upstream é uma operação de merge de verdade. Se o GráficaCRM divergir sem disciplina, em 12 meses ele vira um fork órfão e sem atualizações de segurança. **Decisão de governança obrigatória:** o GráficaCRM é um *downstream* que consome o upstream periodicamente (recomendado), ou um fork que para de acompanhar (aceitar a dívida)?

**P11 — Doutrina interna pesada.** O `CLAUDE.md` tem 67 KB de regra não-negociável (RLS obrigatório, migrations + baseline + manifest, audit quando há efeito, QA visual pela tela, branch protection com 5 checks, packaging sem build na máquina do cliente). **Isso é bom e é custo**: cada desenvolvedor novo (ou cada sessão de IA) precisa seguir. Ignorar a doutrina não gera erro de compilação — gera regressão silenciosa meses depois.

**P12 — Superfície de manutenção muito alta.** 553 route handlers, 110 server actions, 48 crons, 9 workers, 13 integrações. Um cliente gráfico usa talvez 20% disso. Manter o resto custa build, migration, teste e CI. A tentação será deletar o que "a gráfica não usa" — e é aí que se quebra a regra do briefing ("não remova funcionalidades"). A resposta certa é **esconder por configuração** (extensões/módulos já existem), não deletar.

**P13 — Dependência de WAHA não oficial.** O `CLAUDE.md` documenta anti-banimento sério (throttle 1 msg/1,2s + jitter, warm-up de 7–14 dias, janela, spinning de copy). Ainda assim, o WhatsApp não oficial é risco operacional e jurídico do cliente. Uma gráfica que perde o número perde o atendimento. Recomendação: canal oficial Meta como caminho primário para campanha e follow-up em volume; WAHA como conveniência de inbox.

**P14 — Custo de IA não é trivial.** `ai_budgets`, `llm_calls`, custo escalonado existem — bom. Mas follow-up automático com IA em escala (3 follow-ups × todos os orçamentos) gera custo por token. Precisa de orçamento por organização configurado desde o dia 1 do GráficaCRM, não depois.

### 7.4 Riscos jurídicos/administrativos

**P15 — MIT exige preservação do copyright** (ver §3). Não é impedimento, é obrigação de fazer.

**P16 — LGPD:** o sistema já tem export/redact/anonimização. Novos dados do nicho gráfico (arquivo de arte do cliente, CPF para nota, endereço de instalação) entram na política de retenção e no redact. Toda tabela nova precisa ser classificada como tenant-aware e entrar no cascade de redact — senão criamos um buraco de LGPD num sistema que se vende como LGPD by design.

---

## 8. Desafios da transformação desktop (e a decisão que não pode ser adiada)

Esta é a parte onde uma escolha errada custa meses. Vou ser explícito sobre o raciocínio, não só sobre a conclusão.

### 8.1 O que a aplicação exige de qualquer shell desktop

1. Renderizar uma UI React/Next pesada (Server Components renderizados no servidor, RSC streaming).
2. Manter sessão autenticada contra a VPS do cliente, com segurança de cookie.
3. WebSocket (Realtime) para inbox e kanban.
4. Download/print de PDF gerado no servidor (`@react-pdf/renderer`).
5. Upload de arquivo (arte gráfica, planilha de catálogo) com progresso.
6. Notificação nativa / desktop.
7. Auto-update sem reinstalação manual.
8. Não vazar credencial no shell.

### 8.2 Comparação das alternativas (não por preferência — por consequência)

| Critério | **Electron** | **Tauri 2** | **PWA instalado** | **Navegador na janela** (recusado por você) |
|---|---|---|---|---|
| Compatibilidade com Next SSR/RSC + cookie | Alta — é Chromium; cookie `SameSite=Strict` funciona se a origem do webview for o domínio da VPS | Média-alta — WebView2 (Chromium/Edge) no Windows, mas origem `tauri://localhost`: **cookie cross-site do Strict quebra** e exige mudar a estratégia de auth | Alta, mas **não é app**: continua no navegador, com barra de endereço | Alta |
| Experiência "programa instalado" | Total: janela própria, ícone, menu, tray | Total | Parcial: atalho + janela do navegador | Não |
| Tamanho do instalador | ~80–150 MB | ~3–10 MB (usa WebView2 do Windows, já instalado no Win10/11) | N/A | N/A |
| Consumo de memória | Alto (Chromium por instância) | Baixo | N/A | Alto |
| Segurança (superfície) | Média — Node no renderer se mal configurado; exige `contextIsolation`, `sandbox`, CSP rígida | Alta — sem Node no renderer por padrão, allowlist de comandos, IPC tipado | Alta | Baixa |
| Integrações nativas Windows | Excelentes (notificação, tray, instância única, file dialogs, impressão, assinatura de código) | Boas, via plugin (tray, updater, dialog, fs) | Limitadas | N/A |
| Auto-update | `electron-updater` maduro | `tauri-plugin-updater` maduro, delta updates | Automático pelo navegador | N/A |
| Maturidade / ecossistema | Altíssimo, 10+ anos | Alto, estável desde Tauri 2 (2024) | Alto | — |
| Esforço para o nosso caso | Baixo-médio | Médio (Rust toolchain, ajuste de auth, plugins) | Muito baixo | Zero |
| Assinatura de código / confiança | Obrigatória (SmartScreen) | Obrigatória | N/A | N/A |

### 8.3 Recomendação fundamentada

**Recommendo Electron, com a UI carregada a partir do domínio da VPS do cliente — não de um bundle local.**

A razão não é preferência: é a **P1**. O produto autentica por cookie `SameSite=Strict` emitido pelo domínio da instalação, e o `proxy.ts` valida sessão em toda rota. Se o webview carrega a UI de uma origem local, o cookie vira cross-site e a sessão não funciona — a "correção" seria trocar `Strict` por `Lax`/`None`, e isso é **enfraquecer a segurança do produto inteiro** (inclusive da versão web de todos os clientes atuais) para acomodar um shell. A alternativa correta é manter a origem do webview **igual** ao domínio da instalação (Electron com `loadURL` do domínio), o que preserva o cookie, RSC, WebSocket e CSP sem tocar em auth.

Isso não é "navegador embrulhado" no sentido que você recusou — e a diferença é mensurável:

- A janela é do app: sem barra de endereço, sem abas, sem menu do navegador, sem "abrir no Chrome".
- O processo tem identidade própria: ícone, nome em `Programs and Features`, instância única, atalho, protocolo `graficacrm://`.
- O shell tem capacidades que o navegador não tem: tray, notificação nativa, menu próprio, tela de diagnóstico de conexão, cache de assets, atualização do shell.
- **O que não teremos** (e precisa ser dito): funcionamento offline de escrita. A UI é renderizada no servidor; sem internet, não há inbox nem kanban. Se você exigir operação offline, a arquitetura muda de patamar (ver §8.4, opção C) e o custo não é "semanas".

**Por que não Tauri:** tecnicamente é mais leve e mais seguro, e seria a escolha se o app fosse verde. Para um app que **já existe** com cookie `Strict` e SSR, Tauri impõe reescrever a estratégia de autenticação e ajustar RSC/streaming ao webview — custo e risco que não se pagam só para economizar 100 MB de instalador. **Por que não PWA:** já existe e não é o que você pediu. **Por que não navegador em janela:** recusado por você, com razão.

**Ponto de reversão:** se em algum momento a decisão migrar para Tauri, o custo é concentrado em autenticação (token em header via IPC em vez de cookie) — e o trabalho de shell é ~20% do esforço total. A decisão Electron não é irreversível no código de negócio, só no shell.

### 8.4 Onde fica cada coisa (prévia da FASE 3)

| Componente | Localização recomendada | Por quê |
|---|---|---|
| Backend (Next) | **VPS**, como hoje | É onde a lógica, RLS, workers e integrações vivem. Mover para o desktop significaria reescrever o produto. |
| Banco | **VPS** (Supabase self-hosted) | Consistência, backup, multi-usuário simultâneo, RLS. Banco local = sincronização = risco de perda de dados. |
| Agentes de IA | **VPS** (worker) | Precisa de chave de provider, custo centralizado, RAG com pgvector. Nunca no desktop. |
| WhatsApp/WAHA | **VPS** | Sessão precisa ser estável e única; o celular do atendente não pode ser o host da sessão. |
| Automações/follow-ups/crons | **VPS** (`scheduler`) | Só funciona com processo sempre ligado. Desktop desligado não pode parar follow-up. |
| Storage (arte, mídia) | **VPS** | Volume compartilhado, backup. |
| Shell desktop | **Windows do cliente** | Janela, tray, atalho, notificação, updater. |
| Cache de leitura | **Windows (opcional)** | Só se quisermos abertura instantânea; não é requisito para o MVP. |
| Atualização do **shell** | Canal próprio (GitHub Releases assinado ou S3) | Update do shell é independente do update da VPS. |

Isto é o que o seu item 5 chama de "arquitetura híbrida", mas com uma diferença importante: a hibridez é **de distribuição**, não de dados. **Não recomendo banco local nem modo offline de escrita** no primeiro ano, pelos motivos que você mesmo deu: "sem problemas de sincronização ou perda de informações". Sincronização bidirecional de CRM é a classe de problema que consome projetos inteiros e produz o pior defeito possível (dois usuários, dois estados, nenhum certo).

---

## 9. Riscos (consolidado)

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Sessão não funciona no shell por cookie `Strict` | Certa se a origem for local | Bloqueante | Carregar UI do domínio da VPS (§8.3) |
| R2 | Fork diverge e perde updates de segurança | Alta sem governança | Alto | Modelo downstream com cadência de merge; registrar em ADR |
| R3 | Modelagem de "ordem de produção" em `custom_fields` | Média | Alto (retrabalho + dados sujos) | ADR de modelagem antes de codar; tabela própria com FK |
| R4 | Preço opcional quebra proposta/import/IA | Média | Médio | Migration + Zod + UI + IA no mesmo PR com testes |
| R5 | Etapa "sem automação" não respeitada → mensagem indevida ao cliente | Média | Alto (cliente recebe "está pronto" errado) | Atributo de etapa + teste no motor + teste E2E de fluxo |
| R6 | Follow-up dispara 2× / não dispara | Média | Alto | Idempotency-Key + evento com timestamp único + teste de reentrega |
| R7 | Custo de IA estoura | Média | Médio | Budget por org obrigatório + alerta |
| R8 | Banimento do número WAHA | Média | Crítico operacional | Canal Meta como primário em volume; warm-up; janela |
| R9 | LGPD: arte e dados do cliente fora do redact | Média | Alto (legal) | Classificar cada tabela nova no cascade |
| R10 | Instalador Windows sem assinatura → SmartScreen bloqueia | Alta se não assinar | Médio (suporte) | Certificado de assinatura de código desde o primeiro release |
| R11 | Manutenção: 553 handlers para uma gráfica | Alta | Médio | Modular por extensão/configuração; não deletar |
| R12 | Divergência doc ↔ código (o próprio repo tem auditoria de 227 afirmações desatualizadas) | Alta | Baixo-médio | Não confiar em doc como fonte; medir por comando |
| R13 | Escopo: "todas as funcionalidades" + 3 módulos novos + desktop | Alta | Alto | Fases com aprovação; nada de big bang |

---

## 10. Recomendações iniciais

1. **Não reescrever. Forkar com governança.** O sistema tem 1M de linhas testadas; reconstruir seria perder dois anos. O valor está em preservar e especializar.
2. **Desktop = Electron carregando o domínio da instalação**, com shell próprio. Decisão justificada em §8.3 e condicionada a auditoria de CSP antes da implementação.
3. **Backend permanece na VPS.** Nenhum dado de negócio no desktop no primeiro ano.
4. **Identidade visual própria via a camada de white-label que já existe** (`platform_branding`), não por edição de arquivos de marca espalhados — o produto inclusive tem teste que impede vazamento de marca no código.
5. **Funil de 8 etapas como pacote de configuração + 2 atributos novos de etapa** (sem automação; categoria de produção), não como pipeline hardcoded.
6. **"Orçamento enviado" como evento de domínio idempotente**, com timestamp próprio, que dispara o fluxo de follow-up — é o coração do briefing §10.3 e a única forma confiável de cumprir os prazos 1/5/30.
7. **Catálogo: preço opcional + especificação técnica.** Evoluir `catalog_products`, preservando import de planilha e apresentação por IA.
8. **Ordem de produção como entidade própria**, linkada a `crm_lead`, com responsável, prazo, etapas de produção e histórico. Kanban e dashboard leem dela.
9. **Dashboard de produção reusando `lib/metrics`**, nunca criando série paralela (evita os dois números divergentes).
10. **Toda tabela nova nasce com `organization_id` + RLS + policy + teste de isolamento + entrada no redact LGPD.** Sem exceção.
11. **Registrar decisões em ADR** (desktop, auth, modelagem de produção, governança do fork) antes de implementar.
12. **Nada de produção, nada de VPS, nada de banco real** até você autorizar por escrito.

---

## 11. Informações que ainda precisam ser esclarecidas

Sem estas respostas eu teria de assumir, e assumir aqui custa caro:

1. **A instalação atual.** Você já tem uma instalação DeskcommCRM rodando em VPS, com dados reais? Quantos usuários, quantas conversas/mês, quantos números de WhatsApp? Isso define se a migração é "instalação nova" ou "evolução de base viva" — são projetos diferentes.
2. **Autenticação dos usuários do desktop.** Login por e-mail+senha na própria instalação, SSO, ou conta central? Há quantos usuários simultâneos por gráfica?
3. **Modo de distribuição.** O GráficaCRM será usado por **uma** gráfica (sua) ou será vendido para várias gráficas? Se for multi-cliente, cada uma com sua VPS, o instalador precisa de "endereço do servidor" configurável no primeiro uso — impacto direto em P2.
4. **Internet da gráfica.** Estável? Precisa operar durante queda de conexão? (Define se offline entra no escopo algum dia.)
5. **WhatsApp.** Uma gráfica, um número, ou vários atendentes em números diferentes? Canal oficial Meta já foi considerado ou é obrigatório WAHA?
6. **Ordem de produção.** A arte/arquivo do cliente entra no sistema (upload) ou fica no drive? Existe faca/prova/checklist de aprovação? Existe cálculo de preço por m² ou por unidade? (Define a complexidade do modelamento.)
7. **Prazo e resultado esperado.** Qual a data em que a gráfica precisa estar operando diariamente no GráficaCRM? Isso define a ordem de entrega dos módulos.
8. **Equipe.** Você trabalha sozinho comigo ou há desenvolvedores? Isso define o nível de automação e a granularidade da documentação.
9. **Assinatura de código.** Há certificado (Code Signing) disponível? Sem ele, o SmartScreen bloqueia o instalador — e é suporte recorrente.
10. **Upstream.** Você quer continuar recebendo atualizações do DeskcommCRM (modelo downstream) ou congelar a base?

---

## 12. O que eu preciso da sua aprovação agora

Para avançar, preciso de três decisões suas. As duas primeiras são estruturais e não reverto sozinho:

**Aprovação 1 — FASE 1.** Este diagnóstico está correto e completo o suficiente para servir de base? (Se algo estiver errado na sua visão do sistema, é agora que corrigimos — depois custa mais.)

**Aprovação 2 — Direção arquitetural.** Concordo com: (a) backend e banco permanecem na VPS; (b) desktop via **Electron** carregando o domínio da instalação, shell próprio, updater; (c) sem modo offline de escrita no escopo inicial; (d) código como **downstream** do upstream, preservando o copyright MIT. Se você quiser Tauri, ou quiser offline, ou quiser banco local, me diga **agora** — cada uma dessas escolhas muda a FASE 3.

**Aprovação 3 — Escopo da primeira entrega.** Proponho, para a FASE 4 (planejamento), uma primeira entrega que prove a espinha dorsal ponta a ponta em vez de 20 telas pela metade: shell desktop + login + inbox + **funil de 8 etapas com "orçamento enviado" e follow-ups 1/5/30** + **kanban de produção com prazo** + **catálogo com preço opcional**. Dashboard de produção completo, especificação técnica avançada e ordem de produção completa entram na entrega seguinte.

Assim que você confirmar, eu entrego a FASE 2 (`INVENTARIO_GRÁFICACRM.md` com matriz de rastreabilidade funcionalidade × preservação × teste) e, em seguida, a FASE 3 (arquitetura comparada com números, ADRs e plano de infraestrutura).

---

### Anexo — arquivos que sustentam as afirmações deste relatório

`package.json` · `ARCHITECTURE.md` · `CLAUDE.md` · `proxy.ts` · `lib/supabase/browser.ts` · `lib/supabase/server.ts` · `next.config.ts` · `app/manifest.ts` · `lib/pwa/*` · `supabase/baseline.sql` · `supabase/migrations/20260901120000_0204_catalogo_de_produtos_da_loja.sql` · `lib/schemas/produtos.ts` · `lib/catalogo/*` · `lib/followup/*` · `lib/kanban/*` · `lib/metrics/*` · `lib/agent-engine/*` · `lib/channels/*` · `lib/waha/*` · `lib/onboarding/pacotes-de-funil.ts` · `app/app/inbox/*` · `app/app/kanban/*` · `app/app/metrics/*` · `app/app/products/*` · `components/inbox/CRMSidePanel.tsx` · `app/api/v1/products/route.ts` · `workers/*` · `docker-compose.prod.yml` · `hostgator-setup-kit/install.sh` · `LICENSE` · `docs/current-state.md` · `docs/runbooks/deploy.md`
