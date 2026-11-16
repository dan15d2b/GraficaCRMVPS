# Sincronização Bidirecional de Etiquetas (DeskcommCRM ↔ WhatsApp Business) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sincronização bidirecional em tempo real entre as etiquetas de conversa do DeskcommCRM e as etiquetas nativas do WhatsApp Business (WAHA), além de permitir a importação inicial do WhatsApp Web/celular para o CRM.

**Architecture:** Módulo cliente WAHA dedicado a labels (`lib/waha/labels.ts`), métodos opcionais no `ChannelAdapter` (`lib/channels/`), disparo outbound assíncrono na mutação de tags de conversa (`app/api/v1/conversations/_handler.ts`), ingestão inbound de webhooks `label.chat.added` e `label.chat.deleted` (`lib/waha/ingest.ts`), e rota/gesto de importação em lote (`app/api/v1/channels/labels/import/route.ts`).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase Postgres (RLS), WAHA REST API (NOWEB engine), Vitest, Tailwind CSS.

**Spec:** [design-sincronizacao-etiquetas-whatsapp.md](file:///C:/Users/brito/.gemini/antigravity/brain/ab57cd7b-a71e-4f53-9c29-72d479058255/design-sincronizacao-etiquetas-whatsapp.md)

## Global Constraints

- Provedores e clientes externos de canal vivem exclusivamente em `lib/channels/` e `lib/waha/` (`pnpm lint:channels` é gate obrigatório).
- Toda consulta e mutação de tenant deve isolar por `organization_id` resolvido de fonte confiável.
- As respostas de APIs devem usar wrappers canônicos `ok()` e `fail()` de `lib/api/wrappers.ts`.
- Mapeamento estrito de cores entre as 8 cores do Deskcomm (`PALETA_DE_ETIQUETAS`) e os índices 0..19 do WhatsApp.
- Preservar invariantes nos arquivos `docker-compose*.yml` conferidos por `tests/unit/assinatura-de-eventos-do-waha.test.ts`.

## Review Focus

1. **Prevenção de loops infinitos:** O webhook `label.chat.added` gerado pelo próprio envio do Deskcomm não pode disparar outro update no WhatsApp.
2. **Resiliência a quedas do WAHA:** Falha temporária no WhatsApp não pode travar ou abortar a gravação de tags no banco do Deskcomm.
3. **Limite de 20 etiquetas:** O WhatsApp Business limita a 20 etiquetas por conta; a criação de novas etiquetas no WhatsApp deve falhar graciosamente quando o teto for atingido.
4. **Idempotência de contatos e conversas:** Resolução de chat WhatsApp (`@s.whatsapp.net` e `@lid`) deve casar com as conversas existentes no CRM sem criar conversas duplicadas.
5. **Normalização de texto:** Tags do Deskcomm são minúsculas (trim + lowercase); o casamento com etiquetas do WhatsApp deve ser insensível a maiúsculas/minúsculas.

---

### Task 1: Mapeamento de Cores e Cliente WAHA para Labels

**Files:**
- Create: `lib/waha/labels.ts`
- Create: `lib/waha/labels.test.ts`

**Interfaces:**
- Consumes: `lib/waha/client.ts` (`getWahaClient`), `lib/tags/cor-da-etiqueta.ts` (`PALETA_DE_ETIQUETAS`)
- Produces:
  ```ts
  export interface WahaLabel {
    id: string;
    name: string;
    color?: number;
    colorHex?: string;
  }
  export function hexParaCorWaha(hex: string | null | undefined): number;
  export function corWahaParaHex(colorIndex: number | undefined): string;
  export async function listarEtiquetasWaha(session: string): Promise<WahaLabel[]>;
  export async function criarEtiquetaWaha(session: string, nome: string, cor?: number): Promise<WahaLabel>;
  export async function obterEtiquetasDoChatWaha(session: string, chatId: string): Promise<WahaLabel[]>;
  export async function definirEtiquetasDoChatWaha(session: string, chatId: string, labelIds: string[]): Promise<void>;
  export async function obterChatsPorEtiquetaWaha(session: string, labelId: string): Promise<Array<{ id: string; pnJid?: string }>>;
  ```

- [ ] **Step 1: Escrever teste unitário com falha em `lib/waha/labels.test.ts`**
  - Testar conversão de cores hex -> índice WAHA e índice WAHA -> hex.
  - Testar chamadas simuladas de API para `listarEtiquetasWaha`, `criarEtiquetaWaha`, `definirEtiquetasDoChatWaha` usando mock do fetch.

- [ ] **Step 2: Rodar teste e verificar falha**
  - Executar: `pnpm vitest run lib/waha/labels.test.ts`
  - Esperado: FAIL (módulo `lib/waha/labels.ts` não existe).

- [ ] **Step 3: Implementar `lib/waha/labels.ts`**
  - Implementar funções de cliente chamando endpoints do WAHA:
    - `GET /api/:session/labels`
    - `POST /api/:session/labels`
    - `GET /api/:session/labels/chats/:chatId`
    - `PUT /api/:session/labels/chats/:chatId` com corpo `{ labels: labelIds.map(id => ({ id })) }`
    - `GET /api/:session/labels/:labelId/chats`
  - Implementar mapeamento de cores entre `PALETA_DE_ETIQUETAS` e os índices do WhatsApp.

- [ ] **Step 4: Rodar teste e verificar aprovação**
  - Executar: `pnpm vitest run lib/waha/labels.test.ts`
  - Esperado: PASS.

- [ ] **Step 5: Commit**
  - `git add lib/waha/labels.ts lib/waha/labels.test.ts`
  - `git commit -m "feat(waha): adiciona cliente REST e mapeamento de cores para etiquetas"`

---

### Task 2: Extensão de `ChannelAdapter` e Implementação no `wahaAdapter`

**Files:**
- Modify: `lib/channels/types.ts`
- Modify: `lib/channels/adapters/waha.ts`
- Create: `lib/channels/adapters/waha-labels.test.ts`

**Interfaces:**
- Consumes: `lib/waha/labels.ts`
- Produces:
  - Adição em `ChannelAdapter` (`lib/channels/types.ts`):
    ```ts
    syncChatLabels?(input: { sessionRef: string; chatId: string; tags: string[]; orgId: string }): Promise<void>;
    listRemoteLabels?(input: { sessionRef: string }): Promise<Array<{ id: string; name: string; colorHex?: string }>>;
    getChatsByRemoteLabel?(input: { sessionRef: string; labelId: string }): Promise<string[]>;
    ```
  - Implementação em `wahaAdapter` que resolve/cria as etiquetas remotas por nome se necessário e atualiza o chat.

- [ ] **Step 1: Escrever teste unitário com falha em `lib/channels/adapters/waha-labels.test.ts`**
  - Testar que `wahaAdapter.syncChatLabels` consulta as labels existentes, cria tags faltantes e associa as IDs corretas ao chat.

- [ ] **Step 2: Rodar teste e verificar falha**
  - Executar: `pnpm vitest run lib/channels/adapters/waha-labels.test.ts`
  - Esperado: FAIL (métodos não implementados).

- [ ] **Step 3: Implementar métodos em `lib/channels/types.ts` e `lib/channels/adapters/waha.ts`**
  - Adicionar assinaturas em `ChannelAdapter`.
  - Implementar no `wahaAdapter` delegando a `lib/waha/labels.ts`.

- [ ] **Step 4: Rodar teste e checagem de governança**
  - Executar: `pnpm vitest run lib/channels/adapters/waha-labels.test.ts`
  - Executar: `pnpm lint:channels`
  - Esperado: PASS em ambos.

- [ ] **Step 5: Commit**
  - `git add lib/channels/types.ts lib/channels/adapters/waha.ts lib/channels/adapters/waha-labels.test.ts`
  - `git commit -m "feat(channels): adiciona suporte a sync de etiquetas no ChannelAdapter e wahaAdapter"`

---

### Task 3: Sincronização Outbound (CRM → WhatsApp) ao Modificar Tags

**Files:**
- Create: `lib/channels/sync-conversa-etiquetas.ts`
- Modify: `app/api/v1/conversations/_handler.ts`
- Create: `tests/unit/sync-conversa-etiquetas.test.ts`

**Interfaces:**
- Consumes: `lib/channels/adapters/waha.ts`, `lib/channels/index.ts` (`getAdapter`)
- Produces:
  ```ts
  export async function sincronizarEtiquetasDaConversaComCanal(
    admin: Admin,
    conversationId: string,
    organizationId: string,
    tags: string[],
  ): Promise<void>;
  ```

- [ ] **Step 1: Escrever teste unitário com falha em `tests/unit/sync-conversa-etiquetas.test.ts`**
  - Testar que dada uma conversa vinculada a uma sessão WhatsApp ativa, a função resolve o chat ID do contato e chama `syncChatLabels` do adapter.
  - Testar que se o canal não suportar etiquetas ou não tiver sessão, a função não falha (noop gracioso).

- [ ] **Step 2: Rodar teste e verificar falha**
  - Executar: `pnpm vitest run tests/unit/sync-conversa-etiquetas.test.ts`
  - Esperado: FAIL.

- [ ] **Step 3: Implementar `lib/channels/sync-conversa-etiquetas.ts` e plugar em `app/api/v1/conversations/_handler.ts`**
  - Implementar `sincronizarEtiquetasDaConversaComCanal` com tratamento de exceções (best-effort, nunca quebra a resposta HTTP).
  - Em `app/api/v1/conversations/_handler.ts`, na alteração de `input.tags`, chamar `void sincronizarEtiquetasDaConversaComCanal(...)`.

- [ ] **Step 4: Rodar testes e verificar aprovação**
  - Executar: `pnpm vitest run tests/unit/sync-conversa-etiquetas.test.ts`
  - Executar: `pnpm vitest run app/api/v1/conversations/[id]/route.test.ts` (ou testes de conversas)
  - Esperado: PASS.

- [ ] **Step 5: Commit**
  - `git add lib/channels/sync-conversa-etiquetas.ts app/api/v1/conversations/_handler.ts tests/unit/sync-conversa-etiquetas.test.ts`
  - `git commit -m "feat(inbox): sincroniza tags da conversa com o WhatsApp no PATCH de conversa"`

---

### Task 4: Inbound Webhooks (`label.chat.added`, `label.chat.deleted`) e Configuração de Composes

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.local.yml`
- Modify: `tests/unit/assinatura-de-eventos-do-waha.test.ts`
- Modify: `lib/waha/envelope.ts`
- Modify: `lib/waha/ingest.ts`
- Create: `tests/unit/waha-ingest-labels.test.ts`

**Interfaces:**
- Consumes: `lib/waha/ingest.ts` (`dispatchWahaEvent`), `lib/waha/labels.ts`
- Produces:
  ```ts
  export async function handleLabelChatAssociation(
    admin: Admin,
    session: SessionStatusRow,
    envelope: WahaEnvelope,
    requestId: string,
  ): Promise<void>;
  ```

- [ ] **Step 1: Atualizar composes e testes de eventos assinados**
  - Adicionar `label.chat.added,label.chat.deleted` na variável `WHATSAPP_HOOK_EVENTS` dos 3 arquivos de compose.
  - Atualizar `tests/unit/assinatura-de-eventos-do-waha.test.ts` para validar que os 3 composes assinam os eventos de label.
  - Rodar: `pnpm vitest run tests/unit/assinatura-de-eventos-do-waha.test.ts` e verificar que passa.

- [ ] **Step 2: Escrever teste com falha para o handler inbound em `tests/unit/waha-ingest-labels.test.ts`**
  - Simular chegada de webhook `label.chat.added` com `{ labelId: "7", chatId: "556199999999@s.whatsapp.net" }`.
  - Verificar se a tag associada ao ID 7 é adicionada a `conversations.tags` sem duplicações.
  - Simular chegada de webhook `label.chat.deleted` e verificar remoção.
  - Verificar que se a conversa já possui a tag, nenhum update redundante é disparado (anti-loop).

- [ ] **Step 3: Implementar `handleLabelChatAssociation` em `lib/waha/ingest.ts`**
  - Mapear o `labelId` para o nome da etiqueta (consultando cache ou WAHA).
  - Encontrar a conversa ativa correspondente ao `chatId` e `organization_id`.
  - Atualizar `conversations.tags` com verificação de diferença real.

- [ ] **Step 4: Rodar teste e verificar aprovação**
  - Executar: `pnpm vitest run tests/unit/waha-ingest-labels.test.ts`
  - Esperado: PASS.

- [ ] **Step 5: Commit**
  - `git add docker-compose*.yml tests/unit/assinatura-de-eventos-do-waha.test.ts lib/waha/ingest.ts tests/unit/waha-ingest-labels.test.ts`
  - `git commit -m "feat(waha): processa webhooks label.chat.added e label.chat.deleted para sincronizar com CRM"`

---

### Task 5: Rota e Botão de Importação Inicial na UI

**Files:**
- Create: `app/api/v1/channels/labels/import/route.ts`
- Create: `app/api/v1/channels/labels/import/route.test.ts`
- Modify: `app/app/settings/tags/_painel.tsx` (ou `page.tsx`)
- Modify: `lib/auth/public-paths.ts` (se aplicável, ou via sessão)

**Interfaces:**
- Consumes: `requireRole("manager")`, `wahaAdapter.listRemoteLabels`, `wahaAdapter.getChatsByRemoteLabel`
- Produces:
  - `POST /api/v1/channels/labels/import` -> retorna `{ imported_labels: number, tagged_conversations: number }`
  - Componente UI com botão "Importar do WhatsApp" e toast de feedback.

- [ ] **Step 1: Escrever teste com falha em `app/api/v1/channels/labels/import/route.test.ts`**
  - Testar autorização (exige `manager`).
  - Testar execução do fluxo de importação com mocks de labels e chats.

- [ ] **Step 2: Rodar teste e verificar falha**
  - Executar: `pnpm vitest run app/api/v1/channels/labels/import/route.test.ts`
  - Esperado: FAIL (rota não existe).

- [ ] **Step 3: Implementar rota `POST /api/v1/channels/labels/import` e botão na UI**
  - Implementar o handler em `app/api/v1/channels/labels/import/route.ts`.
  - Atualizar o vocabulário canônico em `organizations.settings.canonical_conversation_tags`.
  - Atualizar as conversas encontradas no banco.
  - Adicionar o botão "Sincronizar do WhatsApp" com estado de loading na tela de configurações de tags.

- [ ] **Step 4: Rodar testes e verificar aprovação**
  - Executar: `pnpm vitest run app/api/v1/channels/labels/import/route.test.ts`
  - Executar: `pnpm typecheck`
  - Esperado: PASS.

- [ ] **Step 5: Commit**
  - `git add app/api/v1/channels/labels/import/ app/app/settings/tags/`
  - `git commit -m "feat(tags): adiciona rota e botão de importação de etiquetas do WhatsApp"`

---

### Task 6: Verificação de Governança, Deploy na VPS e Teste E2E com WhatsApp Real

**Files:**
- Modificações gerais / sync com VPS

- [ ] **Step 1: Rodar suíte de governança local**
  - Executar: `pnpm lint:channels`
  - Executar: `pnpm typecheck`
  - Executar: `pnpm test:unit`
  - Garantir zero falhas.

- [ ] **Step 2: Atualizar contêiner WAHA e código na VPS**
  - Atualizar `WHATSAPP_HOOK_EVENTS` no arquivo de ambiente do WAHA na VPS para incluir `label.chat.added,label.chat.deleted`.
  - Reiniciar contêiner do WAHA se necessário (`sudo docker compose -f docker-compose.prod.yml up -d waha`).
  - Sincronizar os novos arquivos da aplicação para a VPS e rebuildar/reiniciar o app.

- [ ] **Step 3: Teste ao vivo de importação e sincronização bidirecional**
  - Clicar no botão "Sincronizar do WhatsApp" e conferir se todas as etiquetas existentes (`pedido em andamento`, `Tirar medidas`, etc.) entram no vocabulário do CRM.
  - No Deskcomm CRM, aplicar a etiqueta `Tirar medidas` a uma conversa e verificar no WhatsApp Web/celular se o selo lilás aparece no chat.
  - No WhatsApp Web, aplicar a etiqueta `Fornecedor` ao mesmo contato e verificar no CRM se a tag aparece na conversa.
