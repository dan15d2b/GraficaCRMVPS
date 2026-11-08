# INVENTÁRIO_GRÁFICACRM.md

**Documento de inventário funcional e matriz de rastreabilidade**
**Fase 2 — GráficaCRM a partir do DeskcommCRM**
**Versão:** 1.0 · **Data:** 08/11/2026
**Base auditada:** `melgarafael/DeskcommCRM` (copyright 2026 Rafael Melgaço, licença MIT), cópia local em `DeskcommCRM-main`

---

## Como usar este documento

Este é o **contrato de preservação**. Toda funcionalidade listada aqui tem um código de rastreio (`FN-xxx`). Nenhuma entrega do GráficaCRM é considerada concluída sem que cada código marcado como `PRESERVAR` ou `MODERNIZAR` tenha sido **verificado por teste**, não por inspeção de tela.

A coluna **Verificação** é o que impede o erro mais comum de projetos de fork: achar que "a tela continua abrindo" é prova de que a funcionalidade funciona. Ela não é. Uma tela pode abrir e estar muda porque a query falhou, o RLS bloqueou, o endpoint mudou de contrato ou o worker parou.

Legenda das colunas:

- **Estado:** `OK` (existe e funciona) · `PARCIAL` (existe com lacuna) · `AUSENTE` (não existe)
- **Decisão:** `PRESERVAR` (não tocar) · `MODERNIZAR` (mesma função, nova UI/implementação) · `ESTENDER` (existe, recebe capacidade nova) · `CRIAR` (novo)
- **Risco:** `A` (quebra a operação se falhar) · `M` (degrada) · `B` (incômodo)

---

## PARTE I — Inventário por domínio

### 1. Plataforma, autenticação e tenancy

| Código | Funcionalidade | Como funciona | Arquivos principais | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|---|
| FN-001 | Login por e-mail e senha | Supabase Auth via `@supabase/ssr`; cookie `sb-deskcomm-auth` `SameSite=Strict`, HttpOnly, Secure | `app/(public)/login`, `lib/supabase/{server,browser}.ts`, `proxy.ts` | OK | PRESERVAR | A | E2E login + logout + sessão expirada |
| FN-002 | Cadastro / signup de organização | Cria usuário + organização + membership; onboarding em 8 passos | `app/(public)/signup`, `app/onboarding/*`, `lib/onboarding/*` | OK | PRESERVAR | A | E2E instalação fresca + primeiro login |
| FN-003 | Recuperação de senha | E-mail transacional (Resend/SMTP), token de recuperação | `app/auth/*`, `lib/email/*` | OK | PRESERVAR | M | E2E pedido de recuperação com receiver real |
| FN-004 | MFA TOTP opcional por política | Duas políticas que somam: `platform_admins.mfa_required` e `organizations.settings.security.mfa_required`; regra pura em `lib/auth/politica-mfa.ts` | `lib/auth/politica-mfa.ts`, `app/app/settings/security` | OK | PRESERVAR | M | Unit + E2E de desafio |
| FN-005 | Códigos de recuperação de MFA | `user_recovery_codes` | `lib/auth/*` | OK | PRESERVAR | M | Unit |
| FN-006 | Sessões ativas e revogação | `mfa_trusted_devices`, listagem e revogação | `app/app/settings/security` | OK | PRESERVAR | M | Unit |
| FN-007 | Multi-tenancy com RLS | `organization_id` em toda tabela tenant-aware; policy via `fn_user_org_ids()` | `supabase/baseline.sql`, `lib/supabase/admin.ts` | OK | PRESERVAR | A | Invariante de isolamento entre 2 orgs (já existe no CI) |
| FN-008 | RBAC de 4 papéis | `viewer < agent < manager < admin`; guard `requireRole()` por rota | `lib/auth/require-role.ts` | OK | PRESERVAR | A | Unit de rank + E2E de 403 |
| FN-009 | Super-admin de plataforma | `platform_admins.is_platform_admin`; área `/admin` | `app/admin/(protected)/*` | OK | PRESERVAR | M | E2E admin |
| FN-010 | Impersonação auditada (suporte) | `platform_support_sessions` + `requireSupportWrite()` em todo handler mutante | `lib/impersonate/*` | OK | PRESERVAR | M | Unit de cobertura de efeitos |
| FN-011 | Audit log append-only | `api_audit_log`; UPDATE/DELETE/TRUNCATE revogados de anon/authenticated/service_role | `lib/audit/*`, migration 0258 | OK | PRESERVAR | A | Invariante sob default ACL |
| FN-012 | Retenção de auditoria (5 anos, executada) | `fn_expurgar_auditoria_vencida` + cron `data-retention` | `lib/retencao/politica.ts` | OK | PRESERVAR | M | Invariante de retenção |
| FN-013 | Rate limit | Upstash Redis (janela fixa) com fallback in-memory | `lib/ai/dispatcher/rate-limit.ts` | OK | PRESERVAR | M | Unit |
| FN-014 | Idempotência de POST | Header `Idempotency-Key`, recibo em `idempotency_keys`, reserva com janela de 60s | `lib/api/idempotency.ts` | PARCIAL | ESTENDER | M | Unit + teste de reentrega |
| FN-015 | API REST v1 + auth dual | Cookie ou `Authorization: Bearer dsk_...`; `lib/auth/public-paths.ts` por rota | `app/api/v1/*`, `lib/api/auth-dual.ts` | OK | PRESERVAR | M | Teste por rota convertida |
| FN-016 | API Tokens | Plaintext mostrado 1×, hash SHA256 no banco | `app/app/settings/api-tokens` | OK | PRESERVAR | M | E2E criação + uso |
| FN-017 | LGPD — pedido, export, redact | `lgpd_requests`, workers de export/redact, anonimização em cascata, SLA D+7/D+15 | `lib/lgpd/*`, `workers/lgpd-*` | OK | PRESERVAR | A | E2E de pedido + invariante de cascade |
| FN-018 | Marca própria (white-label) | `platform_branding` + `organizations.settings.branding`; resolvedor nunca lança | `lib/branding/*` | OK | ESTENDER | M | Unit de branding + teste de não-vazamento |
| FN-019 | Extensões declarativas | Pacotes instaláveis em runtime, revogáveis, com recibo idempotente | `lib/extensions/*`, `app/app/extensions` | OK | ESTENDER | B | E2E instalar/remover |
| FN-020 | Módulos opcionais | Cadências de e-mail, Honorários, Comandas, Lista de espera (ligáveis) | `lib/modulos/catalogo.ts`, `modulos_instalados` | OK | PRESERVAR | B | Unit + E2E de liga/desliga |
| FN-021 | Recursos opcionais (~44 flags) | Cada recurso da operação liga/desliga por organização | `lib/recursos-opcionais/catalogo.ts` | OK | ESTENDER | M | Unit de resolução |
| FN-022 | Onboarding por nicho | 6 pacotes de funil prontos + sugestão por IA | `lib/onboarding/pacotes-de-funil.ts`, `proposta-de-funil.ts` | OK | ESTENDER | M | E2E onboarding |
| FN-023 | i18n pt/en/es | Dicionário centralizado | `lib/i18n/*` | OK | PRESERVAR | B | Unit |
| FN-024 | PWA (app no celular) | `manifest.ts`, `lib/pwa/*`, instalação standalone | `app/manifest.ts`, `lib/pwa/*` | OK | PRESERVAR | B | E2E manifest |
| FN-025 | Health check | Supabase + Redis + WAHA | `app/api/v1/health/route.ts` | OK | ESTENDER | A | Unit + uso pelo desktop (ver FN-201) |

### 2. Atendimento (inbox)

| Código | Funcionalidade | Como funciona | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|---|
| FN-101 | Inbox de 3 painéis | Lista + thread + painel CRM lateral; tempo real via Supabase Realtime | `app/app/inbox/*`, `components/inbox/*` | OK | MODERNIZAR | A | E2E conversa ponta a ponta |
| FN-102 | Lista de conversas com filtros | Filtros por etapa, dono, canal, tag, não lidas; busca | `components/inbox/InboxFilters.tsx` | OK | MODERNIZAR | M | E2E filtro |
| FN-103 | Envio de mensagens | Texto, mídia, áudio, contato, localização, template | `lib/waha/send.ts`, `lib/messaging/*` | OK | PRESERVAR | A | E2E envio + recebimento |
| FN-104 | Recebimento via webhook WAHA | HMAC SHA512 com `timingSafeEqual`; idempotência `(org, external_id)` | `lib/waha/ingest.ts`, `webhook-auth.ts` | OK | PRESERVAR | A | Unit + E2E webhook real |
| FN-105 | Mídia (upload, download, Storage) | Bucket privado, URL assinada, `media-persist`/`media-derive` workers | `workers/media-*.ts`, `lib/messaging/media/*` | OK | PRESERVAR | A | E2E mídia |
| FN-106 | Atribuição e transferência | `conversation_assignment_events`, rodízio, setores | `lib/atendimento/*` | OK | PRESERVAR | A | E2E atribuição |
| FN-107 | Painel CRM lateral na conversa | Mostra etapa, valor, campos, permite mover etapa | `components/inbox/CRMSidePanel.tsx` | OK | **ESTENDER** | A | E2E: mover etapa dentro da conversa |
| FN-108 | Notas internas e menções | `conversation_notes` | `components/inbox/*` | OK | PRESERVAR | M | E2E |
| FN-109 | Rascunhos | `conversation_drafts` | `lib/inbox/*` | OK | PRESERVAR | B | Unit |
| FN-110 | Tags de conversa e contato | `conversation-tags`, `contact-tags` | `app/api/v1/*` | OK | PRESERVAR | M | E2E |
| FN-111 | Ações em lote | Seleção múltipla, atribuir, arquivar, tag | `components/inbox/BarraDeAcoesEmLote.tsx` | OK | PRESERVAR | M | E2E |
| FN-112 | Atalhos de teclado | `react-hotkeys-hook` | `InboxKeyboardShortcuts.tsx` | OK | PRESERVAR | B | Unit |
| FN-113 | Central de avisos operacionais | `agent_inbox_items`: mensagem travada, canal mudo, espera esquecida | `lib/avisos/*` | OK | PRESERVAR | M | Unit + E2E |
| FN-114 | Radar (conversas esfriando) | Score de risco, `crm_lead_risk_states` | `app/app/radar`, `lib/crm-b2b/*` | OK | PRESERVAR | B | E2E |
| FN-115 | Snooze / retomada | Adiamento com retorno agendado | `app/api/v1/cron/snooze-watcher` | OK | PRESERVAR | M | Unit |
| FN-116 | Pausa de automação por intervenção | Intervenção humana suspende IA na conversa | `lib/followup/intervencao.ts` | OK | ESTENDER | A | Unit + E2E |
| FN-117 | Grupos de WhatsApp | Só os ligados em Conexões › Grupos; remetente `p.author` | `lib/grupos/*`, migration grupos | OK | PRESERVAR | B | Unit |
| FN-118 | Opt-out / STOP detection | Regra única compartilhada entre ingestão e runtime | `lib/opt-out/deteccao.ts` | OK | ESTENDER | A | Unit (corpus PT/ES) |
| FN-119 | Respostas rápidas (templates) | `message_templates`, grupos de templates | `app/app/templates` | OK | PRESERVAR | B | E2E |
| FN-120 | Notificação de nova conversa | Push web, som, badge | `lib/notifications/*`, `web-push` | OK | ESTENDER | B | E2E + notificação no desktop (FN-205) |

### 3. CRM, funis e kanban

| Código | Funcionalidade | Como funciona | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|---|
| FN-130 | Funis configuráveis | `crm_pipelines` com `vocabulary` jsonb e `settings` (campos, tags, motivos de perda) | `lib/pipelines/*`, `app/app/settings/tenant/pipelines` | OK | **ESTENDER** | A | E2E criação de funil |
| FN-131 | Etapas com semântica | `crm_stages`: `is_won`, `is_lost`, `requires_human`, `expected_duration_hours`, `position` numérica | `supabase/baseline.sql` | PARCIAL | **ESTENDER** | A | Ver FN-132, FN-133 |
| FN-132 | Etapa "sem automação" | `requires_human` é informativo; não impede follow-up de disparar | — | **AUSENTE** | **CRIAR** | A | Teste do motor: etapa `sem_automacao` não gera envio |
| FN-133 | Categoria de produção por etapa | Nenhuma noção de "esta etapa é produção" | — | **AUSENTE** | **CRIAR** | A | Unit + E2E dashboard |
| FN-134 | Kanban com drag-and-drop | `@hello-pangea/dnd`, fractional indexing (`midpoint()`), realtime, echo otimista | `app/app/kanban/*`, `lib/kanban/*` | OK | **ESTENDER** | A | E2E mover card |
| FN-135 | Criação e edição de lead | `crm_leads` com `custom_fields` declarativos (Zod dinâmico) | `app/api/v1/leads/*` | OK | PRESERVAR | A | E2E |
| FN-136 | Campos customizados por funil | Schema declarativo em `pipeline.settings.fields` | `lib/schemas/*` | OK | **ESTENDER** | M | Unit de schema |
| FN-137 | Timeline de atividades | `crm_lead_activities` polimórfica | `app/app/activities` | OK | PRESERVAR | M | E2E |
| FN-138 | Anexos no cartão | `crm_lead_attachments` | `lib/kanban/anexos-no-card.ts` | OK | **ESTENDER** | M | E2E upload |
| FN-139 | Tarefas | `crm_tasks` + planos de tarefa + lembrete por cron | `app/app/tasks` | OK | PRESERVAR | M | E2E |
| FN-140 | Contatos (PF/PJ) | `contacts`, `people`, `companies`, telefones E.164 | `app/app/contacts`, `people`, `companies` | OK | PRESERVAR | A | E2E |
| FN-141 | Propostas comerciais | `crm_proposals`, itens, PDF, templates, aceite, expiração, régua | `lib/propostas/*`, `app/app/proposals` | OK | **ESTENDER** | A | E2E proposta → PDF → aceite |
| FN-142 | Metas e previsão | `crm_metas`, painel de previsão | `app/app/metrics` | OK | PRESERVAR | M | E2E |
| FN-143 | Motivo de perda | `lost_reason` obrigatório quando `status='lost'` | `lib/leads/encerramento.ts` | OK | PRESERVAR | M | Unit |
| FN-144 | Clonagem de lead entre funis | `clonar-para-funil.ts` | `lib/leads/*` | OK | PRESERVAR | B | Unit |
| FN-145 | Score e risco do lead | `crm_lead_scores`, `crm_lead_risk_states` | `lib/kanban/score-band.ts` | OK | PRESERVAR | B | Unit |
| FN-146 | Agenda completa | Google Calendar sync, tipos de evento, profissionais, recursos, lista de espera | `lib/agenda/*`, `app/app/agenda` | OK | PRESERVAR | M | E2E + integração Google |
| FN-147 | Chamadas / VoIP | Asterisk, trunk SIP, `voice_calls` | `lib/voip/*`, `app/app/calls` | OK | PRESERVAR | B | Manual + unit |

### 4. Agente de IA

| Código | Funcionalidade | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|
| FN-160 | Agentes versionados com publicação | `ai_agents`, `ai_agent_versions`, `ai_agent_version_channels` | OK | PRESERVAR | A | E2E criar/publicar/rollback |
| FN-161 | Prompt de sistema e guardrails | `system_prompt`, `guardrails` jsonb, `config` | OK | **ESTENDER** | A | Unit + teste de prompt |
| FN-162 | Turno do agente | `lib/agent-engine/agent/inbound-turn.ts` — classificação, decisão, draft, entrega | OK | **ESTENDER** | A | E2E turno completo |
| FN-163 | Guardrails before-send | `before_send_traces`; bloqueia envio indevido | OK | PRESERVAR | A | Unit |
| FN-164 | RAG por tenant (pgvector) | `ai_knowledge_sources`, `ai_chunks`, indexer | OK | **ESTENDER** | A | E2E indexar e responder |
| FN-165 | Memória da organização | `org_memory_entries` versionada | OK | **ESTENDER** | M | Unit |
| FN-166 | Skills instaláveis | `skill_versions`, `skill_activations` | OK | PRESERVAR | M | E2E |
| FN-167 | Casos (a IA opera um caso) | `agent_cases`, `agent_case_events`, `conversa-do-caso` | OK | PRESERVAR | M | E2E |
| FN-168 | Roteadores de agente | `ai_routers`, `ai_router_decisions` | OK | PRESERVAR | M | Unit |
| FN-169 | Handoff IA→humano | Por sentimento e por gatilho | OK | **ESTENDER** | A | E2E handoff |
| FN-170 | Preview de resposta | Mostra o que sairia e por que seria barrado | OK | PRESERVAR | B | Unit |
| FN-171 | Budget e custo de IA | `ai_budgets`, `llm_calls`, custo escalonado | OK | **ESTENDER** | M | Unit |
| FN-172 | MCP server interno | `app/api/mcp/*`, `lib/mcp/*` | OK | PRESERVAR | M | E2E |
| FN-173 | MCP por agente/contato (OAuth) | `ai_agent_mcp_servers`, OAuth por contato | OK | PRESERVAR | B | Manual |
| FN-174 | Flywheel / golden / judge | Destilação com gate humano | OK | PRESERVAR | B | Unit |
| FN-175 | Opt-out no runtime | Mesma regra da ingestão | OK | PRESERVAR | A | Unit |
| FN-176 | Consulta ao catálogo pela IA | `lib/ai/catalogo/*`, apresentação de produto | OK | **ESTENDER** | A | E2E: cliente pergunta preço, IA responde conforme cadastro |
| FN-177 | Apresentação de produto no WhatsApp | Texto/áudio + fotos, `show_price` | `lib/catalogo/apresentacao.ts` | OK | **ESTENDER** | A | E2E envio de apresentação |
| FN-178 | Provedores e credenciais de IA | `ai_provider_credentials`, validação por provider | OK | PRESERVAR | A | Unit |
| FN-179 | Uso, execuções e evolução | Telas de uso/orçamento, runs, evolution | OK | PRESERVAR | B | E2E |

### 5. Follow-ups e automações

| Código | Funcionalidade | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|
| FN-190 | Motor de fluxo versionado | `followup_flow_versions`, `pointers`, `graph-schema.ts`, `engine.ts` | OK | PRESERVAR | A | Unit extensa + E2E |
| FN-191 | Nós: wait, condition, ai_classify, match_reply, repeat, collect, skill, action, internal_task, move_lead, edit_lead_tag | `lib/followup/node-handlers.ts` | OK | **ESTENDER** | A | Unit por tipo |
| FN-192 | Espera fixa e espera "smart" (IA) | `timing-plan.ts`, `plano-de-tempo.ts` | OK | PRESERVAR | M | Unit |
| FN-193 | Inscrição por evento | `followup_enrollments`, `followup_enrollment_events` | OK | PRESERVAR | A | Unit |
| FN-194 | Gatilho por mudança de etapa | `gatilho-etapa.ts` | OK | **ESTENDER** | A | E2E: mover para etapa dispara fluxo |
| FN-195 | Gatilho por lead / caso / retorno / presença | `gatilho-*.ts` | OK | PRESERVAR | M | Unit |
| FN-196 | Janela de disparo e pacing | `janela-de-disparo.ts`, `pacing`, throttle 1 msg/1,2s + jitter | OK | PRESERVAR | A | Unit |
| FN-197 | Silence sweep | Cliente sumiu: o que fazer, com cooldown e regras | OK | PRESERVAR | M | Unit (9 arquivos) |
| FN-198 | Cancelamento por motivo | `cancel_reason`, `outcome` | OK | **ESTENDER** | A | E2E: venda cancela follow-up |
| FN-199 | Histórico de follow-ups consultável | `followup_enrollment_events`, `FollowupDoContato.tsx` | OK | **ESTENDER** | M | E2E |
| FN-200 | Automações QUANDO/SE/ENTÃO | `automation_rules`, `automation_rule_runs` | OK | PRESERVAR | M | E2E |
| FN-201 | Cadências de e-mail | `email_cadences` (módulo opcional) | OK | PRESERVAR | B | E2E |
| FN-202 | Campanhas | `campaigns`, recipients, supressões | OK | PRESERVAR | M | E2E |
| FN-203 | **Evento "orçamento enviado"** | — | **AUSENTE** | **CRIAR** | A | E2E: marcar enviado → cadeia 1/5/30 agendada |
| FN-204 | **Cadeia 1/5/30 dias ancorada no envio** | Motor suporta, configuração não existe | **PARCIAL** | **CRIAR** | A | E2E com relógio controlado |
| FN-205 | **Envio automático "pronto para retirada"** | `enviar-texto-fixo` existe; gatilho de etapa não | **PARCIAL** | **CRIAR** | A | E2E: mover etapa → mensagem enviada |

### 6. Canais e integrações

| Código | Funcionalidade | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|
| FN-220 | WAHA multi-sessão | `lib/waha/*`, `lib/channels/adapters/waha.ts` | OK | PRESERVAR | A | E2E com WAHA real |
| FN-221 | Conexão por QR / pairing code | `pairing-code.ts`, `connect-waha.ts` | OK | PRESERVAR | A | E2E |
| FN-222 | Saúde de sessão e reconexão | `channel_session_health`, `session-watchdog` | OK | PRESERVAR | A | Unit + E2E |
| FN-223 | Warm-up e anti-banimento | `channel_session_warmup`, throttle, jitter, spinning | OK | PRESERVAR | A | Unit |
| FN-224 | Meta Cloud API | `lib/channels/meta/*`, templates | OK | PRESERVAR | M | E2E template |
| FN-225 | Canal social (datafy/zernio) | `lib/channels/social/*` | OK | PRESERVAR | B | Unit |
| FN-226 | Webhooks de saída | `webhook_sources`, assinatura, replay, retenção | OK | PRESERVAR | M | E2E com receiver real |
| FN-227 | Webhooks de entrada (lead capture) | `webhook_lead_captures` | OK | PRESERVAR | M | E2E |
| FN-228 | Nuvemshop | `lib/nuvemshop/*` | OK | PRESERVAR | B | Manual |
| FN-229 | Google Calendar | `calendar_*`, crons de sync | OK | PRESERVAR | M | E2E integração |
| FN-230 | Meta Ads / Google Ads | `lib/plataformas-de-anuncio/*` | OK | PRESERVAR | B | Manual |
| FN-231 | **Banco externo (MySQL/Postgres)** | `lib/external-db/*` com introspecção e guardas | OK | **ESTENDER** | M | Unit + teste de leitura |
| FN-232 | VoIP / Asterisk | `asterisk/`, `lib/voip/*` | OK | PRESERVAR | B | Manual |
| FN-233 | Cobrança (Stripe/Asaas) | `lib/cobranca/*` | OK | PRESERVAR | B | Manual |
| FN-234 | E-mail transacional | `lib/email/*` (Resend/SMTP) | OK | PRESERVAR | M | E2E convite |
| FN-235 | Sentry | `sentry.*.config.ts` | OK | PRESERVAR | B | Manual |

### 7. Análise e operação

| Código | Funcionalidade | Arquivos | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|---|
| FN-250 | Desempenho por funil e atendente | `app/app/metrics`, `lib/metrics/*` | OK | **ESTENDER** | M | E2E com dados reais |
| FN-251 | Série temporal e valores do período | `serie-temporal.ts`, `valores-do-periodo.ts` | OK | **ESTENDER** | M | Unit |
| FN-252 | Taxa e tempo por etapa | `taxa-da-etapa.ts`, `tempo-da-etapa.ts` | OK | PRESERVAR | M | Unit |
| FN-253 | Atrito e perdas | `atrito.ts`, `perdas.ts` | OK | PRESERVAR | B | Unit |
| FN-254 | Painel de atendimento | `app/app/painel` | OK | **ESTENDER** | M | E2E |
| FN-255 | Audit log na tela | `app/app/audit` | OK | PRESERVAR | M | E2E |
| FN-256 | **Dashboard de produção gráfica** | — | **AUSENTE** | **CRIAR** | A | E2E com dados reais, nunca mock |
| FN-257 | **Kanban de produção** (cartão de pedido) | `lib/kanban` base existe | **PARCIAL** | **CRIAR** | A | E2E mover pedido + refletir na conversa |

### 8. Desktop (novo domínio)

| Código | Funcionalidade | Estado | Decisão | Risco | Verificação |
|---|---|---|---|---|---|
| FN-300 | Shell desktop Windows (janela própria, ícone, nome) | AUSENTE | CRIAR | A | Execução real no Windows |
| FN-301 | Instalador `.exe` com atalho e entrada em Programas | AUSENTE | CRIAR | A | Instalação em máquina limpa |
| FN-302 | Tela de conexão (endereço do servidor + validação via health) | AUSENTE | CRIAR | A | E2E: endereço válido/inválido/offline |
| FN-303 | Autenticação no shell preservando cookie `Strict` | AUSENTE | CRIAR | A | Teste de sessão persistente |
| FN-304 | Tratamento de queda de conexão (tela de status, retry) | AUSENTE | CRIAR | A | Teste com rede derrubada |
| FN-305 | Auto-update do shell | AUSENTE | CRIAR | M | Teste de update assinado |
| FN-306 | Notificação nativa Windows | AUSENTE | CRIAR | B | Teste manual |
| FN-307 | Menu, tray, instância única | AUSENTE | CRIAR | B | Teste manual |
| FN-308 | Assinatura de código do executável | AUSENTE | CRIAR | M | Verificação de assinatura |
| FN-309 | Cache de assets (abertura rápida) | AUSENTE | CRIAR | B | Medição de tempo de abertura |

---

## PARTE II — Funcionalidades NOVAS do GráficaCRM

| Código | Funcionalidade | Depende de | Complexidade | Risco | Justificativa |
|---|---|---|---|---|---|
| GN-01 | Pacote de funil "Gráfica" com 8 etapas | FN-130, FN-131 | Baixa | A | Configuração + seed; não hardcode |
| GN-02 | Atributo `sem_automacao` em etapa | FN-131, FN-190 | Média | A | Enterprise briefing §10.6 exige que a IA não dispare nada |
| GN-03 | Atributo de categoria de produção em etapa | FN-131 | Baixa | A | Sustenta dashboard e kanban de produção |
| GN-04 | Evento de domínio `orcamento_enviado` (idempotente) | FN-141, FN-203 | Média | A | Base do cronômetro 1/5/30 |
| GN-05 | Ação "Orçamento enviado" na conversa | FN-107, GN-04 | Média | A | Briefing §10.2 |
| GN-06 | Fluxo de follow-up 1/5/30 com cancelamento | FN-190, GN-04, FN-198 | Alta | A | Briefing §10.3 |
| GN-07 | Mensagem automática "pronto para retirada" configurável | FN-205, FN-194 | Média | A | Briefing §10.5 |
| GN-08 | Preço opcional no catálogo | FN-176, FN-141 | Média | M | Briefing §9 — toca import, proposta e IA |
| GN-09 | Especificação técnica de produto (dimensão, material, acabamento, variações, prazo) | FN-176 | Alta | A | Sem isso a IA não coleta especificação |
| GN-10 | Ordem de produção como entidade | FN-133, FN-135 | Alta | A | Maior peça de modelagem nova |
| GN-11 | Kanban de produção com prazo e responsável | GN-10, FN-134 | Alta | A | Briefing §8.1 |
| GN-12 | Dashboard de produção (indicadores reais) | GN-10, FN-250 | Alta | A | Briefing §8 |
| GN-13 | Indicadores de produtividade por funcionário | GN-10, FN-008 | Média | M | Briefing §8 |
| GN-14 | Follow-up consultável no dossiê da conversa | FN-199 | Baixa | B | Briefing §10.3 (histórico) |
| GN-15 | Identidade visual GráficaCRM | FN-018 | Média | M | Briefing §6 |
| GN-16 | Tela de conexão e diagnóstico no app | FN-302, FN-304 | Média | A | Briefing §4 |
| GN-17 | Esconde módulos fora do nicho por permissão | FN-021 | Baixa | M | Substitui "deletar funcionalidade" |

---

## PARTE III — Matriz de rastreabilidade

A matriz completa (75 telas × 6 colunas) está abaixo em formato compacto. Cada linha é uma tela navegável do produto.

**Legenda:** `P`=preservar · `M`=modernizar · `E`=estender · `N`=nova tela

| # | Tela (rota) | Grupo | Decisão | Códigos FN | Teste de aceite |
|---|---|---|---|---|---|
| 1 | `/app/inbox` | Atendimento | M | FN-101..120 | Enviar e receber mensagem real; mover etapa; follow-up aparece |
| 2 | `/app/radar` | Atendimento | P | FN-114 | Lista respeita filtros |
| 3 | `/app/agenda` | Atendimento | P | FN-146 | Criar compromisso + sync |
| 4 | `/app/agenda/lista-de-espera` | CRM | P | FN-146 | Módulo opcional liga/desliga |
| 5 | `/app/templates` | Atendimento | P | FN-119 | Criar e usar resposta rápida |
| 6 | `/app/kanban` | CRM | E | FN-134, GN-11 | Mover card; persistir posição; refletir na conversa |
| 7 | `/app/campaigns` | CRM | P | FN-202 | Criar campanha; supressão respeitada |
| 8 | `/app/contacts` | CRM | P | FN-140 | CRUD + merge |
| 9 | `/app/companies` | CRM | P | FN-140 | CRUD |
| 10 | `/app/people` | CRM | P | FN-140 | CRUD |
| 11 | `/app/tasks` | CRM | P | FN-139 | Criar tarefa + lembrete |
| 12 | `/app/tasks/planos` | CRM | P | FN-139 | Unidade |
| 13 | `/app/calls` | CRM | P | FN-147 | Manual |
| 14 | `/app/cold-call` | CRM | P | FN-147 | Manual |
| 15 | `/app/products` | CRM | E | FN-176, FN-177, GN-08, GN-09 | Criar produto **sem preço**; IA responde "solicitar orçamento" |
| 16 | `/app/imports` | CRM | P | FN-176 | Importar planilha com preço vazio |
| 17 | `/app/proposals` | CRM | E | FN-141, GN-04 | Proposta → PDF → marcar enviada → follow-up |
| 18 | `/app/comandas` | CRM | P | FN-020 | Módulo opcional |
| 19 | `/app/prospecting` | CRM | P | — | Manual |
| 20 | `/app/cadencias` | CRM | P | FN-201 | Módulo opcional |
| 21 | `/app/ai/agents` | IA | P | FN-160 | Criar/publicar/rollback |
| 22 | `/app/ai/followups` | IA | E | FN-190..199, GN-06 | Fluxo 1/5/30 publicável |
| 23 | `/app/ai/atendimento` | IA | E | FN-162 | Fluxo de atendimento |
| 24 | `/app/ai/routers` | IA | P | FN-168 | Unit |
| 25 | `/app/ai/credentials` | IA | P | FN-178 | Validar chave |
| 26 | `/app/ai/providers` | IA | P | FN-178 | Unit |
| 27 | `/app/ai/knowledge/sources` | IA | E | FN-164 | Indexar e responder |
| 28 | `/app/ai/memory` | IA | E | FN-165 | Unit |
| 29 | `/app/ai/skills` | IA | P | FN-166 | Instalar skill |
| 30 | `/app/ai/cases` | IA | P | FN-167 | E2E caso |
| 31 | `/app/ai/cases/avisos` | IA | P | FN-167 | Unit |
| 32 | `/app/ai/inbox` | IA | P | FN-113 | Unit |
| 33 | `/app/ai/proposals` | IA | P | FN-174 | Gate humano |
| 34 | `/app/ai/runs` | IA | P | FN-171 | Lista |
| 35 | `/app/ai/usage` | IA | E | FN-171 | Budget |
| 36 | `/app/ai/evolution` | Análise | P | FN-179 | Lista |
| 37 | `/app/connections` | Canais | P | FN-220..224 | Conectar QR real |
| 38 | `/app/integrations/nuvemshop` | Canais | P | FN-228 | Manual |
| 39 | `/app/webhooks` | Canais | P | FN-226, FN-227 | Receiver real |
| 40 | `/app/faturamento` | Análise | P | FN-020 | Módulo |
| 41 | `/app/honorarios` | Análise | P | FN-020 | Módulo |
| 42 | `/app/metrics` | Análise | E | FN-250..253 | Dados reais |
| 43 | `/app/ads/meta` | Análise | P | FN-230 | Manual |
| 44 | `/app/activities` | Análise | P | FN-137 | Lista |
| 45 | `/app/painel` | Análise | E | FN-254 | E2E |
| 46 | `/app/audit` | Análise | P | FN-011, FN-255 | E2E |
| 47 | `/app/settings/profile` | Org | P | — | E2E |
| 48 | `/app/settings/security` | Org | P | FN-004..006 | E2E MFA |
| 49 | `/app/settings/notifications` | Org | P | FN-120 | E2E |
| 50 | `/app/settings/aplicativo` | Org | E | FN-024, FN-300 | PWA + desktop |
| 51 | `/app/team` | Org | P | FN-008 | Convite |
| 52 | `/app/settings/atendimento` | Org | P | FN-106 | Unit |
| 53 | `/app/settings/automacoes` | Org | P | FN-200 | E2E |
| 54 | `/app/settings/tags` | Org | P | FN-110 | E2E |
| 55 | `/app/settings/recursos` | Org | E | FN-021, GN-17 | Ligar/desligar |
| 56 | `/app/settings/tenant` | Org | P | FN-007 | E2E |
| 57 | `/app/settings/tenant/pipelines` | CRM | E | FN-130..133, GN-01..03 | Criar funil de 8 etapas |
| 58 | `/app/settings/tenant/agenda` | Org | P | FN-146 | E2E |
| 59 | `/app/settings/tenant/proposals` | Org | P | FN-141 | E2E |
| 60 | `/app/settings/tenant/proposals/modelos` | Org | P | FN-141 | E2E |
| 61 | `/app/settings/tenant/financeiro` | Org | P | — | Lista |
| 62 | `/app/settings/cadencias` | Org | P | FN-201 | Módulo |
| 63 | `/app/settings/metas` | Org | P | FN-142 | E2E |
| 64 | `/app/settings/conversoes` | Org | P | FN-230 | Manual |
| 65 | `/app/settings/meta-ads` | Org | P | FN-230 | Manual |
| 66 | `/app/settings/marca` | Org | E | FN-018, GN-15 | Aplicar marca GráficaCRM |
| 67 | `/app/settings/billing` | Org | P | FN-233 | Manual |
| 68 | `/app/lgpd/requests` | Org | P | FN-017 | E2E pedido |
| 69 | `/app/settings/api-tokens` | Org | P | FN-016 | Criar + usar |
| 70 | `/app/settings/voip-trunk` | Org | P | FN-232 | Manual |
| 71 | `/app/settings/servidor-mcp-externo` | Org | P | FN-172 | Manual |
| 72 | `/app/extensions` | Org | E | FN-019 | Instalar pacote |
| 73 | `/app/integracao-dados` | Org | E | FN-231 | Ler banco externo |
| 74 | `/app/ajuda` | Org | P | — | Abre |
| 75 | `/app/painel` (dashboard produção) | Análise | **N** | GN-12, GN-13 | Dados reais obrigatórios |

**Novas telas do GráficaCRM:**

| # | Tela (rota proposta) | Códigos | Teste de aceite |
|---|---|---|---|
| N1 | `/app/producao` — dashboard de produção | GN-12, GN-13 | Números batem com o banco; nenhum indicador fake |
| N2 | `/app/producao/kanban` — kanban de produção | GN-11 | Mover card atualiza etapa + reflete na conversa |
| N3 | `/app/producao/[id]` — ordem de produção | GN-10 | Criar, editar, histórico, responsável, prazo |
| N4 | `/app/products/[id]/especificacoes` | GN-09 | Especificações salvam e IA as lê |
| N5 | Shell desktop: tela de conexão | GN-16, FN-302 | Validação, erro de rede, retry |
| N6 | Shell desktop: diagnóstico | GN-16, FN-304 | Mostra estado do servidor |

---

## PARTE IV — Riscos técnicos identificados

| # | Risco | Onde | Mitigação |
|---|---|---|---|
| T1 | Cookie `SameSite=Strict` quebra sessão em webview de origem local | `proxy.ts:97`, `lib/supabase/browser.ts:145` | Carregar UI do domínio da instalação (Fase 3) |
| T2 | `NEXT_PUBLIC_APP_URL` acopla a uma URL fixa | `.env.example:510` | Modelo de endpoint por instalação |
| T3 | Ausência de CSP observada na borda | `proxy.ts` | Auditoria + CSP antes do shell |
| T4 | Preço obrigatório impede o caso "sob orçamento" | `lib/schemas/produtos.ts:154`, `catalog_products.preco_cents` | GN-08 com migration + Zod + proposta + IA |
| T5 | `custom_fields` usado como depósito de produção | anti-pattern do `CLAUDE.md` | GN-10 com tabela própria |
| T6 | Evento de orçamento duplicado dispara 2 cadeias | novo | Idempotency-Key + unique no evento |
| T7 | Etapa sem automação não respeitada | motor | GN-02 + teste do motor + E2E |
| T8 | Fork divergir do upstream | governança | Modelo downstream + ADR |
| T9 | Novas tabelas fora do RLS/redact | LGPD | Checklist obrigatório por migration |
| T10 | Instalador sem assinatura (SmartScreen) | Windows | Certificado OV cloud antes do 1º cliente |
| T11 | Superfície de 553 handlers para um nicho | manutenção | GN-17: esconder por permissão, nunca deletar |
| T12 | Custo de IA em follow-up de volume | `ai_budgets` | Orçamento obrigatório desde o dia 1 |
| T13 | Banimento de número WAHA | operação | Canal Meta como primário em volume |
| T14 | Documentação interna declaradamente desatualizada | `docs/current-state.md` | Medir por comando, nunca citar doc |

---

## PARTE V — Critérios de aceite da preservação

Uma funcionalidade só é considerada **preservada** quando os quatro critérios abaixo forem verdadeiros. Tela abrindo não é nenhum deles.

1. **Existe teste automatizado** que exercita o caminho (unit para regra, E2E para fluxo de usuário, invariante para RLS/schema).
2. **O teste passa no GráficaCRM**, não só no upstream — rodado após a mudança, não antes.
3. **O efeito persiste**: recarregar a página, reabrir o app e reiniciar o servidor mantêm o estado.
4. **O efeito é auditado** onde a doutrina exige (`api_audit_log` para mutação relevante).

Para as funcionalidades de risco `A` (28 códigos), exijo adicionalmente **prova ponta a ponta com recurso real**: WhatsApp real via WAHA, banco recriado do baseline, e — quando houver IA no caminho — a prova em par (a tela e a ferramenta chamada direto, com o mesmo texto, concordando).

---

## PARTE VI — O que NÃO será feito sem sua autorização explícita

1. Remover qualquer rota, tabela, coluna ou recurso listado neste inventário.
2. Alterar schema em produção.
3. Migrar dados existentes.
4. Desligar módulo como forma de "limpar" o produto.
5. Trocar a estratégia de autenticação para acomodar o shell.
6. Publicar instalador para terceiros.
7. Mexer na VPS atual.

---

*Este inventário é a linha de base. A Fase 3 (arquitetura) parte dele; a Fase 4 (planejamento) o converte em ordem de execução; a Fase 6 (testes) o usa como checklist de aceite.*
