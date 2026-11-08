# ARQUITETURA GRÁFICACRM — Fase 3

**Proposta arquitetural fundamentada**
**Data:** 08/11/2026 · **Versão:** 1.0
**Base:** `INVENTARIO_GRAFICACRM.md` (Fase 2) e `RELATORIO-FASE-1-AUDITORIA.md` (Fase 1)
**Decisões já tomadas por você:** várias gráficas, uma instalação cada · instalação nova (sem base legada) · sem modo offline · primeira entrega é o app desktop

---

## 1. Premissa que organiza tudo

O sistema tem ~1 milhão de linhas e um produto que já funciona. A arquitetura do GráficaCRM **não pode ser uma reescrita** — tem de ser uma **camada de distribuição nova** somada a **especialização de produto** por configuração e schema aditivo.

A pergunta que decide cada peça é: *isto precisa existir uma vez por gráfica, uma vez no mundo, ou uma vez por estação de trabalho?*

- **Uma vez por gráfica:** backend, banco, workers, sessão de WhatsApp, agentes, automações, storage. → **VPS do cliente**
- **Uma vez por estação:** janela, ícone, atalho, notificação, updater, cache de assets. → **Windows do cliente**
- **Uma vez no mundo:** canal de release do instalador, certificado de assinatura, documentação. → **você**

Não há nada no GráficaCRM que deva existir "uma vez no mundo" e ser obrigatório para o funcionamento — e essa é a razão pela qual a arquitetura que desenho abaixo **não tem dependência central**. Foi a sua escolha (várias instalações independentes), e ela é a escolha correta para um produto vendido por instalação.

---

## 2. As duas opções de conexão app ↔ servidor (o desenho que você pediu)

### 2.1 Opção 1 — Instalador único, endereço informado na primeira abertura

```
┌────────────────────────────────────────────────────────────────────┐
│  PC DA GRÁFICA (Windows)                                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GráficaCRM.exe (Electron)                                    │  │
│  │                                                              │  │
│  │  1ª execução:                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │  Conectar ao seu servidor                              │  │  │
│  │  │  Endereço: [ crm.suagrafica.com.br        ]            │  │  │
│  │  │            (pré-preenchido se veio por link)           │  │  │
│  │  │            [ Testar conexão ]                          │  │  │
│  │  │  ✔ Servidor encontrado — GráficaCRM v2.3.1             │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                      │                                       │  │
│  │                      ▼  salva em armazenamento seguro local   │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │  Janela do app (sem barra de endereço)                 │  │  │
│  │  │  webview ──► https://crm.suagrafica.com.br/app        │  │  │
│  │  │              origem = domínio da instalação            │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS
                                ▼
                   ┌────────────────────────────┐
                   │ VPS da gráfica             │
                   │ Next + Supabase + WAHA     │
                   │ (exatamente como hoje)     │
                   └────────────────────────────┘
```

**Por que funciona sem tocar em autenticação:** a origem do webview **é** `https://crm.suagrafica.com.br`. O cookie `sb-deskcomm-auth` com `SameSite=Strict` é do mesmo site — envia normalmente. `proxy.ts` valida sessão, RSC faz streaming, Realtime conecta, e o `Set-Cookie` não é rejeitado. **Zero mudança no backend.**

**Provisionamento assistido** (para o cliente não digitar nada):

```
graficacrm://conectar?servidor=crm.suagrafica.com.br
```

O app registra o protocolo no Windows. Você manda o link; a gráfica clica; o app abre com o endereço preenchido e só pede "Testar conexão" e o login. Alternativa sem protocolo: um arquivo `.graficacrm` com JSON assinado que o app importa na tela de conexão.

**Custo de infraestrutura adicional:** zero. Não há servidor novo, não há DNS novo, não há banco de credenciais.

**Custo de experiência:** uma tela a mais na primeira execução (eliminável pelo link), e um erro de digitação possível se o link não for usado — mitigado pela validação via `/api/v1/health` antes de aceitar o endereço.

### 2.2 Opção 3 — Instalador único apontando para domínio central

```
┌────────────────────────────────────────────────────────────────────┐
│  PC DA GRÁFICA (Windows)                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GráficaCRM.exe ──► https://app.graficacrm.com.br             │  │
│  │                    (SEU domínio, sempre)                     │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────────┐
              │ SEU SERVIDOR CENTRAL (novo)                │
              │  • página/endpoint de descoberta           │
              │  • autenticação que identifica o cliente   │
              │  • banco com credenciais de TODOS          │
              │    os clientes                             │
              │  • roteamento para a VPS correta           │
              └───────────────┬────────────────────────────┘
                              │ redirect (302)
                              ▼
                 ┌──────────────────────────────┐
                 │ VPS da gráfica               │
                 │ (destino final)              │
                 └──────────────────────────────┘
```

**O que isso exige que hoje não existe:** um serviço de descoberta/autenticação central, com banco próprio, alta disponibilidade, monitoração, backup, e um contrato de operador de dados com **cada** gráfica (porque o login passa por você).

**Consequências medidas:**

| Aspecto | Opção 1 | Opção 3 |
|---|---|---|
| Serviços a manter | 0 extras | 1 serviço central + banco + monitoração + on-call |
| Ponto único de falha | Nenhum | **Sim** — seu domínio cai, todas as gráficas param |
| Você é operador de dados (LGPD) | Não | **Sim** — login de todos os clientes |
| Superfície de ataque | Cada instalação, isolada | Instalação central + N instalações |
| Alteração no backend | **Nenhuma** | Endpoint de descoberta + auth central + redirect |
| Custo operacional | R$ 0/mês | Servidor + banco + domínio + monitoração (~R$ 150–400/mês) |
| Experiência na 1ª execução | Tela de conexão (ou link) | Nenhuma tela |
| Independência do cliente | Total | Perdida |

### 2.3 Recomendação

**Opção 1 com provisionamento assistido.** Ela entrega a mesma experiência de primeira execução da Opção 3 (porque o link pré-preenche o endereço) **sem** a dependência central, sem o serviço novo e sem você virar operador de dado de terceiros.

Registro o critério que inverteria a recomendação, para não parecer teimosia: se no futuro você quiser **cobrança centralizada, SSO entre produtos, ou painel único de todos os clientes**, a Opção 3 passa a ter valor — e aí o serviço central deixa de ser um custo e vira o produto. Hoje ele seria custo puro.

---

## 3. Comparação das tecnologias desktop

### 3.1 O critério que elimina alternativas

Três requisitos do produto, nesta ordem, decidem:

1. **Sessão por cookie `SameSite=Strict`** emitido pelo domínio da instalação. Qualquer shell que carregue a UI de origem diferente quebra login.
2. **UI renderizada no servidor** (RSC streaming) — não é SPA; não há build estático para embarcar.
3. **Programa Windows de verdade**: janela própria, ícone, atalho, `Programas e Recursos`, instância única, updater.

O requisito 1 sozinho elimina "carregar do bundle local". O requisito 2 elimina "app offline-first". O requisito 3 elimina PWA e navegador embrulhado.

### 3.2 Comparação

| Critério | Electron | Tauri 2 | PWA | Navegador na janela |
|---|---|---|---|---|
| Cookie `SameSite=Strict` do domínio da VPS | Funciona (Chromium, origem = domínio) | Funciona **se** a janela apontar para o domínio; quebra se carregar de `tauri://` | Funciona | Funciona |
| RSC / streaming | Nativo | Nativo no WebView2 | Nativo | Nativo |
| Instalador | ~90–140 MB | ~3–8 MB (WebView2 já vem no Win10/11) | N/A | N/A |
| RAM por janela | ~180–300 MB | ~80–150 MB | N/A | ~180–300 MB |
| Segurança do shell | Média — exige `contextIsolation`, `sandbox`, `nodeIntegration:false`, CSP | Alta por padrão | Alta | Baixa |
| Capacidade nativa Windows | Excelente (tray, notificação, protocolo, impressão, dialogs) | Boa (plugins) | Limitada | Inexistente |
| Auto-update | `electron-updater` maduro | `tauri-plugin-updater` maduro | Automático | N/A |
| Curva para esta equipe | Baixa (JS/TS) | Média (Rust + toolchain) | Nula | Nula |
| Risco de regressão no produto | Zero (nada muda no backend) | Baixo-médio (ajuste de auth se carregar local) | Zero | Zero |
| Assinatura obrigatória | Sim | Sim | N/A | N/A |

### 3.3 Decisão

**Electron**, com a UI carregada do domínio da instalação.

Justificativa em uma frase: é a única opção que entrega "programa instalado" **sem exigir nenhuma mudança na autenticação** do produto que já existe — e mudar autenticação para acomodar um shell significaria enfraquecer `SameSite=Strict` para todos os clientes, inclusive os que só usam o navegador.

Configuração de segurança obrigatória no shell (não negociável):

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`
- `will-navigate` e `setWindowOpenHandler` restritos ao domínio configurado
- `session.setPermissionRequestHandler` negando tudo que não seja `notifications` e `media` (o composer usa microfone — FN-103)
- CSP injetada pelo shell **e** pelo servidor (ver §7)
- Nenhum token, senha ou chave no `localStorage` do shell — a sessão é o cookie do servidor

**Reversibilidade:** se um dia migrarmos para Tauri, o custo é o shell (módulo isolado, ~20% do esforço total). Nenhuma linha de negócio é afetada.

---

## 4. Arquitetura alvo

```
                                VOCÊ (fora do runtime)
                    ┌──────────────────────────────────────┐
                    │ Release do shell (GitHub Releases     │
                    │ privado ou bucket) + certificado OV   │
                    └──────────────────┬───────────────────┘
                                       │ binário assinado
┌══════════════════════════════════════▼═══════════════════════════════┐
║  ESTAÇÃO DE TRABALHO — Windows (Nestações por gráfica)               ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ GráficaCRM.exe — Electron                                     │   ║
║  │  main (Node)   · janela, tray, menu, protocolo, updater       │   ║
║  │  preload       · IPC mínimo, contexto isolado                 │   ║
║  │  renderer      · webview apontando para o domínio da VPS      │   ║
║  │  local         · endereço do servidor, preferências, cache    │   ║
║  └───────────────────────────┬───────────────────────────────────┘   ║
╚══════════════════════════════╪═══════════════════════════════════════╝
                               │ HTTPS + WebSocket (cookie Stric, HttpOnly)
                               ▼
┌══════════════════════════════════════════════════════════════════════┐
║  VPS DA GRÁFICA (uma por cliente — inalterada em relação ao hoje)   ║
║                                                                     ║
║  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐            ║
║  │ Caddy      │→ │ app      │  │ worker   │  │scheduler│            ║
║  │ TLS+CSP    │  │ Next 16  │← │ event_log│  │ cron    │            ║
║  └────────────┘  └────┬─────┘  └────┬─────┘  └───┬────┘            ║
║                       │             │            │                  ║
║  ┌────────────────────▼─────────────▼────────────▼───────────────┐  ║
║  │ Supabase self-hosted: Postgres + RLS + Auth + Realtime +      │  ║
║  │ Storage + pgvector                                            │  ║
║  └───────────────────────────────────────────────────────────────┘  ║
║                       │                                            ║
║  ┌────────────────────▼──────┐   ┌─────────────────────────────┐   ║
║  │ WAHA Plus (sessão única)  │   │ Redis (rate limit, pacing)  │   ║
║  └───────────────────────────┘   └─────────────────────────────┘   ║
║                                                                     ║
║  Novos módulos do GráficaCRM (mesmo processo, mesmo banco):         ║
║  • funil de 8 etapas  • evento orçamento enviado  • follow-up 1/5/30║
║  • ordem de produção  • kanban de produção        • dashboard       ║
║  • catálogo com preço opcional + especificação                     ║
└═════════════════════════════════════════════════════════════════════┘
```

**Regra estrutural:** todo módulo novo vive no **mesmo** processo e no **mesmo** banco, consumindo as mesmas tabelas de funil. Nada de "sistema de produção separado" — foi a sua exigência (§11 do briefing) e é o que evita os dois números divergentes.

---

## 5. Fluxos que precisam ser desenhados antes de codar

### 5.1 Primeira execução

```
abrir .exe
  └─ existe endereço configurado? ──não──► tela de conexão
  │                                          ├─ usuário digita OU link pré-preenche
  │                                          ├─ GET /api/v1/health
  │                                          │    ├─ 200 + json.gráfica → salva
  │                                          │    ├─ 200 sem assinatura esperada → "não é uma instalação GráficaCRM"
  │                                          │    ├─ timeout → "servidor não respondeu"
  │                                          │    └─ TLS inválido → "certificado não confiável"
  │                                          └─ salva em armazenamento do SO (não em texto plano no repo)
  └─ sim ──► carrega webview no domínio salvo
              └─ /app sem sessão → redirect /login (comportamento do produto, inalterado)
```

### 5.2 Atualização do shell

Canal servido pela VPS de cada cliente (sua escolha), em `/app-updates/`:

```
shell consulta GET /app-updates/latest.json a cada N horas e ao iniciar
  → compara versão; se nova, baixa o binário e verifica assinatura
  → instala no próximo fechamento (ou sob confirmação do usuário)
```

Detalhe importante: o **shell** e **o produto (Next)** têm ciclos de atualização diferentes. O update do produto continua exatamente como hoje (`update.sh` na VPS). O shell atualiza sozinho. Não misturar os dois — e documentar isso na tela "Sobre" para não gerar chamado de suporte confuso.

### 5.3 Queda de conexão

Sem offline por decisão sua. O comportamento correto não é fingir que funciona:

- Webview perde a conexão → tela de status do próprio shell (não é erro 500 do produto): "Sem conexão com `<servidor>`. Tentando novamente em 15s."
- Reconectou → recarrega a rota atual, sessão preservada por cookie
- Servidor responde 503 → mensagem específica ("servidor em manutenção") em vez de tela genérica

---

## 6. Onde cada componente roda (a sua pergunta do §5 do briefing)

| Componente | Local | Por quê |
|---|---|---|
| Backend Next | VPS | Lógica, RLS, 553 handlers |
| Banco | VPS | Consistência, backup, multiusuário |
| Agentes de IA | VPS (worker) | Chave de provider, custo central, RAG |
| WhatsApp/WAHA | VPS | Sessão única e estável |
| Automações, follow-ups, crons | VPS (scheduler) | Precisa rodar com o PC desligado |
| Storage de arte/mídia | VPS | Volume compartilhado e backup |
| Kanban, dashboard, produção | VPS (dados) / renderizado no webview | Uma fonte de verdade |
| Shell, janela, tray, updater | Windows | — |
| Endereço do servidor, preferências | Windows (armazenamento do SO, criptografado) | — |
| Cache de assets | Windows (disco do webview) | Abertura mais rápida |

**Custos por instalação (estimativa, ordem de grandeza):**

| Item | Mensal |
|---|---|
| VPS 4 vCPU / 8 GB (app + worker + scheduler + WAHA + Redis) | R$ 120–250 |
| Postgres self-hosted (no mesmo host) | incluso |
| Storage 1 GB + mídia (cresce com uso) | R$ 0–50 |
| IA (tokens) — depende de volume; um agente ativo com ~2.000 turnos/mês | R$ 150–600 |
| Domínio + TLS | ~R$ 5 |
| **Total** | **R$ 275–905/mês por gráfica** |

Não incluo o custo do certificado de assinatura porque é anual e seu (R$ 1.000–2.200/ano, ver Fase 1 §"assinatura"), não por instalação.

---

## 7. Segurança — o que precisa existir antes do shell

Este é o ponto onde encontrei a lacuna mais concreta da auditoria: **o repositório não define `Content-Security-Policy`**. Está escrito no próprio código (`lib/branding/logo-arquivo.ts`): *"não há `Content-Security-Policy` neste repositório: medido, `next.config.ts` não define `headers()` com CSP e não há `middleware.ts`"*. Existe `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy` — mas não CSP.

No navegador isso já é uma dívida. Num app desktop é pior: o webview tem privilégios de shell. Antes de embarcar qualquer webview:

1. **CSP no servidor** (`next.config.ts` → `headers()` ou no `proxy.ts`), com `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, e as origens do Supabase (Realtime via `connect-src wss://`) e do Storage explicitamente listadas.
2. **CSP no shell** como segunda camada (defesa em profundidade) — o shell reescreve o header apenas para negar `frame`, `object` e `eval`, sem tentar ser mais restritivo que o servidor (senão quebra RSC).
3. **Sem `loadURL` arbitrário.** O shell só navega para o endereço configurado; qualquer tentativa de navegar para outro domínio abre o navegador do sistema, não a janela.
4. **Segredos nunca no shell.** Nenhuma chave de Supabase, token de API ou credencial é embarcada no binário. O binário é público por definição — uma vez instalado, qualquer pessoa com um editor hexadecimal o lê.
5. **Assinatura do binário** e verificação de assinatura no updater (sem isso, o updater é um vetor de execução remota).

---

## 8. Nada de reescrever: como o GráficaCRM se especializa

### 8.1 O funil de 8 etapas

Não hardcoded. É um **pacote de onboarding** novo (`lib/onboarding/pacotes-de-funil.ts`, ao lado de clínica/imobiliária/curso/loja/serviços) mais dois atributos novos em `crm_stages`:

```
crm_stages (aditivo)
  + sem_automacao      boolean not null default false
  + categoria_operacional text  -- 'comercial' | 'producao' | 'encerrado'
```

`sem_automacao` é lido pelo motor de follow-up **antes** de qualquer nó de envio (GN-02). `categoria_operacional` alimenta dashboard e kanban de produção (GN-03). Ambos com default que preserva o comportamento atual de todas as instalações existentes — nenhuma etapa antiga muda de comportamento.

O pacote "Gráfica", por sua vez, é dado de seed:

| Ordem | Etapa | `is_won` | `is_lost` | `sem_automacao` | `categoria` |
|---|---|---|---|---|---|
| 1 | Lead | – | – | false | comercial |
| 2 | Fazer Orçamento | – | – | false | comercial |
| 3 | Acompanhar | – | – | false | comercial |
| 4 | Em produção | – | – | false | producao |
| 5 | Pronto para retirada | – | – | false | producao |
| 6 | Pronto para entrega/instalação | – | – | **true** | producao |
| 7 | Serviço Concluído | **true** | – | true | encerrado |
| 8 | Não fechou | – | **true** | true | encerrado |

### 8.2 O cronômetro 1/5/30

Ponto mais delicado do projeto. O prazo tem de ser **1, 5 e 30 dias contados do envio do orçamento**, não da última mensagem.

```
[Humano clica "Orçamento enviado" na conversa]
        │
        ▼
POST /api/v1/leads/{id}/orcamento-enviado   (Idempotency-Key obrigatório)
        │
        ├─ grava evento único: crm_lead_events(kind='orcamento_enviado', at=now())
        │    └─ unique (organization_id, lead_id, kind, versao_orcamento)
        ├─ move etapa → "Acompanhar"  (via o mesmo caminho que a UI usa hoje)
        └─ inscreve no fluxo follow-up 1/5/30 com next_eval_at = at + 1d
                 │
                 ├─ teto de 3 tentativas (max_attempts)
                 ├─ janela de disparo respeitada (janela-de-disparo.ts)
                 ├─ se etapa vira produção/serviço concluído → cancel_reason='venda'
                 ├─ se etapa vira não fechou → cancel_reason='perdido'
                 ├─ se cliente pede opt-out → cancel_reason='opt_out'
                 └─ se humano intervém → pausa, não cancela
```

Por que evento único importa: o mesmo orçamento pode ser reenviado (segunda via). Isso **não** deve reiniciar o relógio nem criar uma segunda cadeia. A chave única é `(organização, lead, tipo de evento, versão do orçamento)`.

### 8.3 Ordem de produção (a peça de modelagem nova)

```
crm_leads (existente) ──1:1 opcional──► production_orders (nova)
                                            ├─ status, prioridade
                                            ├─ prazo_entrega (date)
                                            ├─ responsavel_user_id (FK real)
                                            ├─ etapa_producao_id (FK crm_stages)
                                            ├─ quantidade, especificacao jsonb (com schema Zod)
                                            ├─ arquivo_arte (attachment)
                                            └─ timestamps de cada marco
                                                    │
                                     production_order_events (timeline)
```

Regras que valem dinheiro:
- `organization_id` em ambas, com policy e teste de isolamento (obrigatório pela doutrina).
- Arquivo de arte entra no **redact LGPD** (FN-017).
- `production_orders` não é `custom_fields` — é tabela com FK. O `CLAUDE.md` proíbe a alternativa por escrito.
- Dashboard e kanban leem **desta** tabela, não de uma cópia. Nenhuma série de produção duplicada em `metrics`.

---

## 9. ADRs (decisões que ficam registradas)

| ADR | Decisão | Reversível? |
|---|---|---|
| ADR-001 | Desktop com Electron carregando o domínio da instalação | Sim (troca só o shell) |
| ADR-002 | Backend, banco, IA, WhatsApp e automações permanecem na VPS | Sim, mas caro |
| ADR-003 | Sem modo offline no escopo inicial | Sim (arquitetura diferente) |
| ADR-004 | Conexão via Opção 1 (instalador único + endereço + provisionamento por link) | Sim |
| ADR-005 | Oito etapas como pacote de configuração, com atributos novos em `crm_stages` | Sim (dado) |
| ADR-006 | "Orçamento enviado" como evento de domínio idempotente | Não sem migração |
| ADR-007 | Ordem de produção em tabela própria, nunca em `custom_fields` | Não sem migração |
| ADR-008 | GráficaCRM é downstream do upstream, com cadência de merge | Sim |
| ADR-009 | Atualização do shell servida pela VPS de cada cliente | Sim |
| ADR-010 | Preço opcional no catálogo (migration + Zod + proposta + IA) | Sim |

---

## 10. Identidade visual — proposta

Você pediu que eu propusesse. Antes de aplicar, precisa de aprovação — e há uma restrição técnica real: o produto já tem **white-label em banco** (`platform_branding`) e um **teste que reprova marca vazada no código** (`tests/unit/branding.test.ts`). Portanto identidade do GráficaCRM se aplica **pela tela de Marca** (`/app/settings/marca` + admin de plataforma), não editando arquivos espalhados.

Direção proposta:

- **Nome:** GráficaCRM (já definido). Uso no Windows: "GráficaCRM" em janelas e menu Iniciar.
- **Cor primária:** azul-tinta profundo (`#1B3A57`), remetendo a tinta de impressão — evitando o azul genérico de SaaS.
- **Acento:** magenta de impressão (`#D6266B`) para ações primárias e estados ativos. É a cor que diz "gráfica" sem clichê de CMYK puro.
- **Neutros:** cinza de papel (`#F5F3EF` fundo claro) e tinta (`#17191C` no escuro).
- **Tipografia:** a mesma do produto hoje (para não fragmentar), com pesos mais altos em títulos de produção.
- **Ícone:** monograma "G" em chapa de impressão (meia-tom), legível a 16 px na barra de tarefas. Precisa ser vetor, com versão clara e escura, e o mesmo arquivo serve ao `.ico` do Windows.
- **Splash do shell:** tela curta com nome, versão e "conectando a `<servidor>`".

Entrego os três itens visuais (ícone 256/512 + `.ico` multi-resolução, splash, kit de cores) na Fase 5, para você aprovar antes de aplicar nas telas.

---

## 11. Riscos arquiteturais que permanecem

| Risco | Mitigação | Residual |
|---|---|---|
| `update.sh` da VPS e updater do shell divergirem | Tela "Sobre" mostra as duas versões; release notes separadas | Baixo |
| Webview sem CSP hoje | Entregar CSP antes do shell | Médio até corrigir |
| SmartScreen bloquear instalador não assinado | Certificado OV cloud antes do 1º cliente | Médio |
| Fork envelhecer (662 migrations) | Cadência de merge trimestral + ADR-008 | Médio |
| Windows 10 antigo sem WebView2 | Electron não depende dele (traz Chromium) | Nulo |
| Um node_modules gigante no repo do fork | `pnpm`, lockfile versionado, build por CI | Baixo |

---

## 12. O que preciso de você para fechar a Fase 3

1. **Aprovar a Opção 1** de conexão (ou dizer que prefere a 3, com o custo que ela tem).
2. **Aprovar Electron** com UI carregada do domínio da instalação.
3. **Aprovar a identidade** proposta na §10 (ou escolher outra direção).
4. **Confirmar** que CSP entra como pré-requisito do shell (é trabalho no produto existente, não só no shell).

Com essas quatro respostas, eu entrego a **Fase 4 — planejamento detalhado**: módulos em ordem de dependência, marcos com critério de aceite, estimativa por bloco, e o que exatamente você vai conseguir usar ao fim de cada marco.

---

### Anexos técnicos desta fase

`proxy.ts` (sessão e borda) · `lib/supabase/browser.ts:145` e `lib/supabase/server.ts` (cookie) · `next.config.ts` (headers) · `lib/branding/logo-arquivo.ts` (lacuna de CSP declarada) · `app/api/v1/health/route.ts` (validação do endereço) · `lib/onboarding/pacotes-de-funil.ts` (pacotes existentes) · `lib/followup/{engine,graph-schema,timing-plan,janela-de-disparo}.ts` (motor) · `lib/kanban/*` (base do kanban) · `lib/metrics/*` (base do dashboard) · `lib/catalogo/*` (catálogo e apresentação) · `supabase/baseline.sql` (schema) · `docker-compose.prod.yml` (infra)
