# Memory.md — DeskcommCRM / GraficaCRM

> Salvado automaticamente por etapa. Última atualização: 2026-11-15.

## Roteiro em Andamento: Especialização GráficaCRM (1 a 5)
- [x] **Passo 1: Rebranding para GráficaCRM** (`APP_NAME="GráficaCRM"`, `APP_ACCENT_HEX="#2563EB"` em `.env.local` e `.env.example`).
- [x] **Passo 2: Funil de 7 Etapas + Dossiê Automático do Briefing** (Pacote em `lib/onboarding/pacotes-de-funil.ts`, prompt de briefing com dossiê automático e handoff em `.agents/skills/deskcomm-cliente-novo/references/nichos.md`).
- [x] **Passo 3: Follow-ups Especializados da Gráfica** (Régua de 4 toques de retorno de orçamento + aviso de retirada em `lib/followup/modelos/grafica.ts`, exportado no catálogo com validação).
- [x] **Passo 4: Dashboard de Controle de Produção** (`/app/producao` com semáforo de prazos, KPIs de chão de fábrica, ações 1-click para retirada/instalação e visualização do dossiê).
- [x] **Passo 5: Agenda Especializada de Comunicação Visual** (`lib/agenda/modelos/grafica.ts` com medição técnica no local, instalação/aplicação, entrega programada e reunião de amostras; botão de importação 1-click em `/app/settings/tenant/agenda`).

## Etapa em Andamento: Instalação e Deploy na VPS (AWS EC2)
- [x] **Infraestrutura VPS (AWS EC2 São Paulo sa-east-1):**
  - Instância: `graficacrm` (`i-02c37af8ec7a8fa73`)
  - Tipo: `c7i-flex.large` (2 vCPU, 4 GiB RAM, 40 GiB SSD gp3)
  - 4 GB Swap configurado e ativo (Total de memória disponível: ~8 GB)
  - IP Elástico (Fixo): `18.230.143.108` associado e persistido
  - Chave SSH: `C:\Users\brito\Desktop\graficacrm-key.pem`
- [x] **Código e Contêineres no Servidor:**
  - Código extraído em `/home/ubuntu/deskcommcrm`
  - Docker 29.9.3 e Docker Compose v5.7.1 instalados
  - Supabase local (Postgres 17, GoTrue Auth, Realtime, Storage, Envoy) 100% ativo e saudável
  - Baseline com 225 tabelas aplicado
  - Super-Admin (`britodaniel797@gmail.com`) criado e associado à organização
  - Todos os 18 contêineres rodando e saudáveis (DB, Auth, Storage, Realtime, Caddy, WAHA, Redis, SRH, Worker, Scheduler, App)
- [x] **Domínio e DNS (Registro.br):**
  - Domínio: `graficacrm27.com.br`
  - Entradas Tipo A gravadas para `18.230.143.108` (`@` e `www`)
  - Aguardando o temporizador de transição do Registro.br (~50 minutos) para propagação pública
- [ ] **Próximo Passo (Após a transição do Registro.br):**
  - Verificar a emissão automática do certificado SSL (Let's Encrypt via Caddy).
  - Acessar `https://graficacrm27.com.br` e realizar o primeiro login com `britodaniel797@gmail.com`.

## Contexto do repositório

- **HEAD:** `1d61940e` — "snapshot: DeskcommCRM base para o GraficaCRM" (branch `master`)
- **Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind 4, Supabase, WAHA, Electron (desktop)
- **Node:** v26.13.0 (projeto fixa Node 22 — risco de diferença)
- **pnpm:** 9.15.9 (sem corepack, instalado via npm -g)
- **git:** fora do PATH; binário em `C:\Program Files\Git\cmd\git.exe`

## Diferenças de ambiente (medidas, não de memória)

| Item | Estado |
|------|--------|
| `pnpm install --frozen-lockfile` | verde |
| `pnpm typecheck` | verde (exit 0) |
| `pnpm test:unit` | interrompido por decisão do dono (~3.353 arquivos, não terminou) |
| `tsc` heap | estoura sem `NODE_OPTIONS=--max-old-space-size=8192` |
| `date-fns@4.4.0` | corrompido no store pnpm → conserto `pnpm install --force` |

## Status dos marcos GraficaCRM

| Marco | Estado | Bloqueante |
|-------|--------|------------|
| M0 — snapshot base | Feito | — |
| M1 — CSP (Content-Security-Policy) | Não iniciado | A1 + A2 não autorizadas |
| M2 — Shell Electron | Código pronto em `desktop/src/` | A1 não autorizada |
| M2.5 — Certificado OV | Não iniciado | custo externo |
| M4 — Migrations de etapa | Não iniciado | depende M2 |

## Autorizações pendentes (CHECKLIST-AMBIENTE.md §6)

| # | Autorização | Status |
|---|-------------|--------|
| A1 | Criar `desktop/` e `docs/graficacrm/` | ⬜ Não autorizada |
| A2 | Alterar `next.config.ts` e `proxy.ts` para CSP | ⬜ Não autorizada |

Sem A1/A2, não toca `next.config.ts` nem cria `docs/graficacrm/`.

## Arquivos principais (críticos para continuidade)

- `INVENTARIO_GRAFICACRM.md` — 68 códigos FN-xxx (inventário funcional, matriz de rastreabilidade)
- `ARQUITETURA-GRAFICACRM-FASE-3.md` — decisões arquiteturais (ADR-001 a ADR-010, 2 opções de conexão)
- `HANDOFF-GRAFICACRM-M0.md` — handoff M0 fechado, exceto A1/A2
- `PLANO-EXECUCAO-FASE-4.md` — plano semanal (Semana 1: M0 + ADRs + CSP Report-Only; Semana 2: enforce CSP; Semana 3-4: desktop)
- `docs/graficacrm/00-ambiente.md` — ambiente medido (já existe)
- `docs/graficacrm/01-m1-csp.md` — M1 CSP (já existe)
- `desktop/src/main.ts` — processo principal Electron, protocolo `graficacrm://`
- `desktop/src/ponte.ts` — contrato IPC (CANAL + EVENTO)
- `desktop/src/servidor.ts` — `normalizarEndereco()`, `ehLoopback()`, `urlDoApp()`
- `desktop/src/diagnostico.ts` — ping `/api/v1/health`, 8 categorias de falha
- `desktop/src/janela.ts` — BrowserWindow hardening, `will-navigate`, CSP local
- `desktop/src/armazenamento.ts` — `safeStorage` com DPAPI fallback
- `desktop/src/atualizacao.ts` — `electron-updater` com feed da VPS do cliente
- `desktop/src/preload.ts` — `contextBridge`, expõe `window.graficacrm`
- `desktop/src/renderer/conexao.js` — tela de conexão (sem HTTP, só IPC)
- `tema-graficacrm.html` — tema UI (CSS vars, paleta)

## Arquivos modificados no working tree (não commitar sem decisão)

- `M CLAUDE.md` — edição não intencional de outro agente (linha `Sempre salvar arquivo Memory.MD`)
- `M lib/branding/logo-arquivo.ts` — comentário CSP desatualizado corrigido
- `M next.config.ts` — headers() existente, CSP ausente
- `M tsconfig.json`, `M tsconfig.typecheck.json` — ajustes de heap/compilação

## Lixo temporário a remover

- `?? _tmp_3_69680d2eb7ebedf51ca075886bbd17d2`
- `?? _tmp_3_bdf3dcf0f8f7095ac1d2b3071bb33b6a`
- `?? .pnpm-store/` (dentro do repo, deveria estar no .gitignore)

## Próxima etapa (sem A1/A2)

Escrever o que for possível sem tocar `next.config.ts` nem criar pastas:

1. **ADR-008** já existe implicitamente no plano — formalizar em `docs/adr/` sobre cadência de merge trimestral downstream.
2. **docs/graficacrm/02-m2-shell-electron.md** — documentar o shell (pré-requisito M2).
3. Revisar `desktop/src/servidor.test.ts` e `desktop/src/diagnostico.test.ts` — garantir que cobrem os casos de segurança do `SameSite=Strict`.

**Bloqueio real:** A1/A2 são pré-requisitos de M1 e M2. Sem elas, não há execução de shell nem CSP. O máximo que avança é documentação e revisão de código existente.
