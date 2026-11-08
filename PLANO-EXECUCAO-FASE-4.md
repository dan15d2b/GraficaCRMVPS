# PLANO DE EXECUÇÃO — GRÁFICACRM (Fase 4)

**Documento de planejamento aprovado para início de desenvolvimento**
**Data:** 08/11/2026 · **Versão:** 1.0
**Depende de:** `RELATORIO-FASE-1-AUDITORIA.md` · `INVENTARIO_GRAFICACRM.md` · `ARQUITETURA-GRAFICACRM-FASE-3.md` · `tema-graficacrm.html`

---

## 0. Decisões aprovadas (contrato desta fase)

| # | Decisão |
|---|---|
| D1 | Várias gráficas, **uma instalação independente cada** |
| D2 | Instalação **nova** — não há base legada a migrar |
| D3 | **Sem modo offline** — online-first, sem banco local, sem fila de sincronização |
| D4 | Primeira entrega é o **app desktop** de ponta a ponta |
| D5 | Conexão por **Opção 1**: instalador único, endereço do servidor na 1ª abertura, com provisionamento por link `graficacrm://conectar` |
| D6 | **Electron** carregando a UI do domínio da instalação |
| D7 | **CSP é pré-requisito** do shell, corrigida no produto antes de embarcar webview |
| D8 | Identidade: azul `#3D4EF5`, fundo `#F3F5FB`, escuro `#0A1020`/`#8393FF`, menta/rosa/âmbar como acentos, meia-tinta como motivo gráfico |
| D9 | Atualização do shell servida pela VPS de cada cliente |
| D10 | GráficaCRM é **downstream** do DeskcommCRM, com cadência de merge |
| D11 | Nada toca produção, VPS ou banco real sem autorização escrita |

---

## 1. O limite do ambiente — e por que ele define a primeira tarefa

Isto precisa estar escrito antes de qualquer cronograma, porque é a diferença entre um plano que se cumpre e um plano que mente.

**Medido agora, no ambiente onde eu executo comandos:**

| Item | Estado |
|---|---|
| `node` | v22.23.4 ✅ |
| `npm` / `npx` | 10.9.9 ✅ |
| `git` | 2.34.1 ✅ |
| `pnpm` | **ausente** (e `corepack` não consegue baixá-lo) |
| `registry.npmjs.org` | **403 do proxy** — bloqueado |
| `github.com` (clone) | **403 do proxy** — bloqueado |
| `node_modules` no projeto | **ausente** (o ZIP não os traz) |
| Disco livre em `/tmp` | 4,4 GB |
| Build nativo Windows | **impossível** — este é um Linux; o instalador `.exe` só se constrói no Windows |

**Consequência direta:** eu não consigo instalar dependências, rodar `pnpm typecheck`, `pnpm test:unit`, `next build` nem empacotar Electron neste ambiente. Posso **escrever** código, migration, spec, teste e documentação — e revisar o que já existe. Não posso **verificar por execução** aqui.

Isso colide de frente com a DoD 12 do projeto (prova pela tela, em ambiente fresco) e com a regra 9 do seu briefing ("teste as funcionalidades"). Não vou declarar nada pronto por inspeção e chamar de prova.

**Duas saídas, e você escolhe uma:**

### Saída A — você roda na sua máquina (recomendada)

O projeto fica no seu Windows, onde `pnpm install` funciona, `next dev` sobe, Playwright roda e o Electron empacota. Eu escrevo os arquivos, você executa os comandos que eu te passo, e cola a saída de volta (ou eu leio o log se a pasta estiver montada). É o caminho que realmente entrega o `.exe`.

**O que você precisa ter:** Node 22, `corepack enable`, Git. O `pnpm install` baixa ~1,2 GB — roda uma vez só.

### Saída B — liberar egress para mim

Adicionar `registry.npmjs.org`, `github.com` e `codeload.github.com` à allowlist de saída (Setup → Capabilities → General restrictions). Mesmo assim: build de Electron e assinatura continuam impossíveis em Linux, e não há Docker/Windows para Playwright de app desktop. Serve para eu rodar **typecheck, lint, unit e invariantes** — não para empacotar.

**Recomendação:** Saída A para tudo que envolve build e prova pela tela; Saída B, se você conseguir liberar, reduz o retrabalho de tipagem e testes enquanto escrevo.

**Se nenhuma das duas for possível agora**, eu escrevo o código sem prova e o marco fica marcado como "entregue sem verificação" — explicitamente reprovado pela minha própria regra. Prefiro não fazer isso com a parte crítica (CSP, autenticação, follow-up).

---

## 2. Bloqueio de versionamento (resolver no dia 1)

A cópia em `Desktop\DeskcommCRM-main` **não tem `.git`** — é um ZIP. Sem histórico:

- Não há como fazer merge do upstream (D10), que é a garantia de não virar fork órfão.
- Não há checkpoint, então a regra 1 do seu briefing (trabalhar em cópia independente) só vale no papel.
- Não há `git diff` para revisar o que mudei.

**Primeira tarefa do M0**, e é você que executa (precisa de rede):

```bash
cd C:\Users\brito\Desktop\DeskcommCRM-main
git init
git remote add upstream https://github.com/melgarafael/DeskcommCRM.git
git fetch upstream --depth=1
git checkout -b grc/base-snapshot
git add -A
git commit -m "snapshot: DeskcommCRM base para o GráficaCRM"
```

A partir daí, todo marco tem commit próprio e tag (`grc-m0`, `grc-m1`…). Se preferir, crio um repositório novo `graficacrm` e a base entra como primeiro commit — o efeito é o mesmo.

---

## 3. Módulos por dependência (ordem de execução)

Ordem não é por preferência: cada bloco depende do anterior estar provado.

```
M0  Fundação de execução          [sem dependência]
 ├─ M1  CSP + cabeçalhos         [depende de M0]
 │   └─ M2  Shell Electron + conexão + updater   [depende de M1]
 │       └─ M3  Identidade GráficaCRM aplicada    [depende de M2 estar rodando]
 ├─ M4  Funil de 8 etapas + atributos de etapa    [depende de M0]
 │   ├─ M5  Evento "orçamento enviado"            [depende de M4]
 │   │   └─ M6  Cadeia de follow-up 1/5/30        [depende de M5]
 │   └─ M7  Mensagem "pronto para retirada"       [depende de M4 + M6]
 └─ M8  Catálogo: preço opcional + especificação  [depende de M0]
     └─ M9  Ordem de produção + kanban + dashboard [depende de M4 + M8]
```

**M1→M2 são sequenciais e obrigatórios** (D7). **M4→M6 é a espinha comercial**; **M8→M9 é a espinha de produção**. Podem correr em paralelo se houver duas frentes; se for só uma, a ordem acima é a certa porque o funil é pré-requisito do kanban de produção.

---

## 4. Marcos, escopo e critério de aceite

### M0 — Fundação de execução

**Duração:** 1 dia · **Bloqueia tudo**

| Entrega | Critério de aceite |
|---|---|
| Repositório git com upstream configurado | `git remote -v` mostra `upstream`; primeiro commit contém a base intacta |
| `pnpm install` + `pnpm typecheck` verdes na sua máquina | Saída colada; zero erro de tipo |
| `pnpm test:unit` verde | Rodapé mostra `Test Files` e `Tests` sem falha (a doutrina exige as duas linhas) |
| Documento `docs/graficacrm/00-ambiente.md` | Registra versões, tempo do install, e os comandos que funcionaram |
| Branch protection anotada | Lista dos 5 checks que precisam passar antes de merge |

**Risco:** o `pnpm install` falhar por versão de Node ou por `patchedDependencies` (`@react-pdf/hyphenate`). Mitigação: usar exatamente `nvm use` (Node 22) e `corepack enable`.

**O que NÃO entra:** nenhuma mudança de produto. M0 é só conseguir executar e provar.

---

### M1 — CSP e cabeçalhos (pré-requisito do shell)

**Duração:** 2–3 dias · **Risco alto, escopo pequeno**

O produto não tem `Content-Security-Policy` — está escrito em `lib/branding/logo-arquivo.ts` que a ausência é o motivo de banir SVG no upload.

| Entrega | Critério de aceite |
|---|---|
| CSP em `next.config.ts` (`headers()`) | Resposta de `/app/inbox` traz `Content-Security-Policy` com `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` |
| Origens do Supabase liberadas explicitamente | `connect-src` inclui `https://<supabase>` e `wss://<supabase>`; Realtime conecta sem erro no console |
| Storage liberado | Imagem do bucket carrega com URL assinada |
| RSC/streaming sem `unsafe-eval` | Página carrega; nenhum `EvalError` |
| Microfone do composer funciona | Gravação de voz (PTT) grava e envia |
| Modo `report-only` primeiro | Uma semana de relatório antes de enforce, se houver tempo |
| Teste automatizado | Teste que falha se o header sumir de uma rota crítica |

**Risco principal:** quebrar Realtime, Storage, fontes ou o editor de fluxo (`@xyflow/react`). **Mitigação:** começar em `Content-Security-Policy-Report-Only` por 3–5 dias em ambiente de teste, com `report-uri` local, e só então `enforce`.

**Não entra:** `nonce` dinâmico por requisição (é possível, mas acopla o `proxy.ts` e complica cache). Primeiro `'self'` + origens explícitas; nonce só se algo exigir.

---

### M2 — Shell Electron: conexão, janela e updater

**Duração:** 6–9 dias · **É a entrega central do D4**

| Entrega | Critério de aceite |
|---|---|
| Projeto `desktop/` no repo (separado do Next) | `desktop/package.json`, `main.ts`, `preload.ts`, `renderer` sem bundling do app |
| Janela própria | Abre sem barra de endereço, sem abas, título "GráficaCRM", ícone próprio na barra e na taskbar |
| Tela de conexão | Campo de endereço; valida via `GET /api/v1/health`; salva em `safeStorage` do Electron |
| Provisionamento | `graficacrm://conectar?servidor=x` registra protocolo e pré-preenche; testado com protocolo real no Windows |
| Erros de conexão | Timeout, DNS inválido, TLS inválido e servidor 503 têm mensagem própria (não tela branca) |
| Hardening do shell | `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `will-navigate` e `setWindowOpenHandler` restritos ao domínio configurado |
| Sessão preservada | Login → fecha o app → reabre → continua logado (cookie do servidor, não token local) |
| Instância única | Segunda execução foca a janela existente em vez de abrir outra |
| Tray + menu | Minimizar para tray; menu com Sobre, Reconectar, Abrir no navegador, Sair |
| Updater | `electron-updater` lendo `/app-updates/latest.json` da VPS; verifica assinatura do pacote |
| Instalador `.exe` | NSIS gera instalador com atalho no Desktop e entrada em Programas; desinstala limpo |
| Prova pela tela | 6 cenários filmados/printados: 1ª execução, endereço errado, sem rede, login, reabertura, update |

**Riscos:** `SameSite=Strict` rejeitado se a origem do webview não for exatamente o domínio salvo (mitigação: normalizar e forçar `https://`); antivírus corporativo bloqueando NSIS (mitigação: assinatura, M2.5).

**Fora do escopo deste marco:** assinatura de código (entra como M2.5 antes do primeiro cliente) e notificação nativa rica (entra no M3 junto da identidade).

---

### M2.5 — Assinatura e canal de release

**Duração:** depende da CA (dias a semanas) · **Pode correr em paralelo**

| Entrega | Critério de aceite |
|---|---|
| Certificado OV com assinatura em nuvem | Emitido; chave em HSM do provedor, nunca no repo |
| CI assina o instalador | Build no Windows runner gera `.exe` assinado |
| Verificação | `Get-AuthenticodeSignature` retorna `Valid` |
| SmartScreen | Instalador baixado de fora não mostra "editor desconhecido" (após período de reputação) |

---

### M3 — Identidade GráficaCRM aplicada

**Duração:** 3–4 dias · **Depende de M2 rodando**

| Entrega | Critério de aceite |
|---|---|
| Tokens no white-label | Cores aplicadas via `platform_branding` / `organizations.settings.branding` — **não** editando arquivo de marca espalhado |
| Tema claro e escuro | Ambos com contraste AA medido (`getComputedStyle` + cálculo), não "a olho" |
| Ícone | `.ico` multi-resolução (16/32/48/256), legível a 16 px |
| Splash do shell | Nome, versão e "conectando a `<servidor>`"; some em <1,5 s |
| Telas que precisam de ajuste | Inbox, kanban e dashboard revisados; o resto herda os tokens |
| Teste de vazamento de marca | `tests/unit/branding.test.ts` verde (ele reprova marca fora do resolvedor) |

**Cuidado registrado:** existe teste que varre `app|components|lib|workers|hooks` procurando marca hardcoded. Alterar cor em componente, em vez de token, reprova o CI. É proteção, não obstáculo.

---

### M4 — Funil de 8 etapas e atributos de etapa

**Duração:** 4–6 dias · **Primeira mudança de schema**

| Entrega | Critério de aceite |
|---|---|
| Migration: `crm_stages.sem_automacao boolean not null default false` | Aplicada; default não altera nenhuma etapa existente |
| Migration: `crm_stages.categoria_operacional text` com CHECK | `'comercial' \| 'producao' \| 'encerrado'`; nulo permitido e tratado |
| Apêndice idempotente no `baseline.sql` | Reaplicar o baseline num banco existente não quebra |
| `-- manifest:` no cabeçalho da migration | Passa o teste `manifest-x-migrations` |
| Pacote de onboarding "Gráfica" | 8 etapas na ordem: Lead · Fazer Orçamento · Acompanhar · Em produção · Pronto para retirada · Pronto para entrega/instalação · Serviço Concluído · Não fechou |
| Atributos corretos no pacote | Só "Serviço Concluído" `is_won`; só "Não fechou" `is_lost`; "Pronto para entrega/instalação" com `sem_automacao=true` |
| Motor respeita `sem_automacao` | Teste: etapa com flag não gera nenhum envio, nem follow-up nem mensagem de etapa |
| UI de etapas | Editar a flag em `/app/settings/tenant/pipelines` com explicação em linguagem clara |
| RLS | Policy de `crm_stages` inalterada; teste de isolamento continua verde |

**Risco:** o motor de follow-up consultar etapa em vários lugares e um deles não checar a flag. **Mitigação:** a checagem entra num único ponto (a função que decide se pode enviar), com teste que varre o caminho — e um teste de invariante que falha se aparecer envio sem passar por ela.

---

### M5 — Evento "orçamento enviado"

**Duração:** 4–5 dias · **Coração do briefing §10.2–10.3**

| Entrega | Critério de aceite |
|---|---|
| Tabela `crm_lead_events` (ou reuso de `crm_lead_activities` com kind próprio — decidir com ADR) | Evento com `at timestamptz` real do clique |
| Unique de idempotência | `(organization_id, lead_id, kind, versao_orcamento)` — reenviar a 2ª via **não** cria segundo evento nem reinicia relógio |
| Endpoint `POST /api/v1/leads/{id}/orcamento-enviado` | Aceita `Idempotency-Key`; 409 em duplicata; audita em `api_audit_log` |
| Ação na conversa | Botão "Orçamento enviado" no painel CRM lateral, com confirmação e data/hora visível |
| Movimentação de etapa | Move para "Acompanhar" pelo mesmo caminho que a UI já usa (sem caminho paralelo) |
| Teste de reentrega | Duas chamadas com a mesma chave → um evento, uma movimentação |

**Ponto de atenção:** "registrar o envio" não é "a mensagem saiu pelo WhatsApp". O briefing diz que não se confunde coleta com envio efetivo; o evento é **declaração humana** de que o orçamento foi enviado. A mensagem pode ter saído por outro canal (e-mail, impresso). O timestamp é o do clique — e é isso que o campo mostra.

---

### M6 — Cadeia de follow-up 1/5/30

**Duração:** 6–8 dias · **Depende de M4 e M5**

| Entrega | Critério de aceite |
|---|---|
| Fluxo publicado "Acompanhar orçamento" | Nós de espera em +1d, +5d, +30d ancorados no `at` do evento |
| Cálculo a partir do envio | Teste com relógio controlado: evento em D0 15:42 → disparos em D+1, D+5, D+30 nesse horário |
| Janela de disparo respeitada | Fora de 7h–22h o envio desloca para a próxima janela, sem perder a contagem |
| Teto de tentativas | `max_attempts = 3`; nada além |
| Cancelamento por venda | Etapa vira "Em produção" → `cancel_reason='venda'`; nenhum disparo posterior |
| Cancelamento por perda | Etapa vira "Não fechou" → `cancel_reason='perdido'` |
| Cancelamento por opt-out | STOP detectado → não envia; registrado |
| Pausa por intervenção humana | Humano responde → automação pausa (não cancela) |
| Resposta do cliente considerada | Cliente responde no meio → o motor avalia a resposta antes do próximo nó (`match_reply`) |
| Registro de falha | Envio que falha grava `last_error` e aparece no histórico |
| Histórico consultável | Dossiê da conversa mostra: enviado, agendado, pendente, falhou, cancelado + motivo |
| Sem duplicata | Teste de disparo duplo: uma mensagem só ao cliente |

**Risco maior do projeto.** Um follow-up que dispara duas vezes queima o cliente; um que não dispara perde a venda e ninguém percebe. **Mitigação:** três testes obrigatórios — disparo único sob reentrega, cancelamento em todos os quatro gatilhos, e um teste de "não disparou e deveria" que compara `next_eval_at` vencido com envios feitos.

---

### M7 — Mensagem "pronto para retirada"

**Duração:** 2–3 dias · **Depende de M4 e M6**

| Entrega | Critério de aceite |
|---|---|
| Gatilho de etapa → envio automático | Mover para "Pronto para retirada" envia mensagem ao cliente |
| Conteúdo configurável | Texto editável com variáveis (nome, pedido, endereço); padrão profissional |
| Etapa "Pronto para entrega/instalação" não dispara | Teste explícito: mover para essa etapa **não** envia nada (D-§10.6) |
| Registro no histórico | Mensagem aparece na conversa como enviada pelo sistema, não como atendente |
| Respeita opt-out e janela | Não envia para bloqueado; fora da janela, agenda |

---

### M8 — Catálogo: preço opcional e especificação técnica

**Duração:** 6–8 dias · **Independente do funil, pode paralelizar**

| Entrega | Critério de aceite |
|---|---|
| Migration: `preco_cents` passa a aceitar nulo | `alter column ... drop not null`; apêndice idempotente no baseline |
| Zod opcional | Cadastro sem preço salva; importação de planilha com célula vazia não quebra |
| UI | Campo de preço com aviso "opcional — deixe vazio para 'sob orçamento'" |
| IA não inventa preço | Teste: produto sem preço → agente responde que é necessário solicitar orçamento; **nunca** um valor |
| IA com preço | Responde o valor cadastrado, com moeda |
| Proposta comercial com item sem preço | Não quebra cálculo; item entra como "a definir" |
| Apresentação do produto | `show_price` respeita ausência de preço |
| Especificações | Dimensões, material, acabamento, variações, prazo — com schema validado por Zod |
| IA coleta especificação | Agente pergunta dimensão/acabamento quando o produto exige |

**Risco:** existem quatro caminhos que leem `preco_cents` (cadastro, import, proposta, apresentação). **Mitigação:** um tipo `PrecoOuSobOrcamento` no domínio, e o TypeScript reprova quem tratar como número.

---

### M9 — Ordem de produção, kanban e dashboard

**Duração:** 10–14 dias · **Maior bloco; depende de M4 e M8**

| Entrega | Critério de aceite |
|---|---|
| Tabela `production_orders` + eventos | `organization_id`, RLS, policy, teste de isolamento entre 2 orgs |
| Vínculo com `crm_leads` | 1:1 opcional; criar ordem a partir de lead em "Em produção" |
| Campos | prazo, responsável (FK), etapa de produção (FK `crm_stages`), quantidade, especificação, arquivo de arte |
| Arquivo de arte no redact LGPD | Pedido de exclusão remove o arquivo do bucket |
| Kanban de produção | Arrastar card move etapa; atualiza status; registra evento; **reflete na conversa** |
| Dashboard com dados reais | Os 9 indicadores do briefing, todos com query testada; nenhum valor mockado |
| Indicadores vazios são honestos | Sem dados, a tela diz "sem pedidos no período" — não mostra zero como se fosse resultado |
| Produção por funcionário | Só aparece quando há responsável identificado |
| Tempo médio pedido→conclusão | Calculado de eventos, não estimado |
| Permissões | `viewer` não move card; `manager` move; tudo auditado |

**Riscos:** duplicar série temporal (mitigação: dashboard lê `lib/metrics`, não cria série própria); performance com muitos pedidos (mitigação: índice por `(organization_id, prazo_entrega)` e paginação).

---

## 5. Estimativa consolidada

| Marco | Dias úteis | Depende de | Risco |
|---|---|---|---|
| M0 Fundação | 1 | — | Baixo |
| M1 CSP | 2–3 | M0 | **Alto** (pode quebrar Realtime/Storage) |
| M2 Shell Electron | 6–9 | M1 | **Alto** (auth + updater) |
| M2.5 Assinatura | paralelo (prazo da CA) | — | Médio |
| M3 Identidade | 3–4 | M2 rodando | Baixo |
| M4 Funil 8 etapas | 4–6 | M0 | Médio |
| M5 Evento orçamento | 4–5 | M4 | Médio |
| M6 Follow-up 1/5/30 | 6–8 | M5 | **Alto** |
| M7 Pronto p/ retirada | 2–3 | M4, M6 | Baixo |
| M8 Catálogo | 6–8 | M0 | Médio |
| M9 Produção + dashboard | 10–14 | M4, M8 | **Alto** |

**Caminho crítico até "app instalado e usando":** M0 → M1 → M2 → M3 = **12 a 17 dias úteis** de trabalho, mais o tempo de assinatura (semanas, em paralelo).

**Caminho até "operação gráfica completa":** + M4 → M5 → M6 → M7 → M8 → M9 = **+32 a 44 dias úteis**.

**Aviso honesto sobre a estimativa:** são dias de trabalho de implementação com teste, sem contar revisão, retrabalho de CSP, e sem contar que eu não consigo executar testes neste ambiente. Com a Saída A (você rodando), o ciclo fica mais lento que o normal — cada verificação depende de você colar a saída. Não vou apresentar isso como "duas semanas e está pronto".

---

## 6. Critério de aceite global (o que "pronto" significa neste projeto)

Uma entrega só é declarada pronta quando **todos** forem verdadeiros:

1. `pnpm typecheck` e `pnpm lint` zerados.
2. `pnpm test:unit` verde — lendo as linhas `Test Files` **e** `Tests` do rodapé.
3. `pnpm test:db` verde quando tocou schema, RLS ou follow-up.
4. Prova pela tela, feita como um leigo faria, com print ou vídeo.
5. Migration com `-- manifest:` **e** apêndice idempotente no baseline.
6. Toda tabela nova com `organization_id`, policy e teste de isolamento.
7. Mutação relevante auditada.
8. Nenhum segredo, token ou chave no código ou no binário.
9. Se a funcionalidade usa IA: prova em par (a tela pelo agente **e** a ferramenta chamada direto, com o mesmo texto, concordando).
10. Documentação atualizada onde o contrato mudou.

**Regra de transparência:** se um item não puder ser verificado no ambiente disponível, ele fica registrado como **não verificado**, com o motivo. Nunca como concluído.

---

## 7. Riscos do plano

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| P1 | Não consigo executar nada no meu ambiente | **Certa** | Alto (atrasa e impede prova) | Saída A: você executa; eu escrevo e reviso |
| P2 | CSP quebra Realtime ou Storage em produção de cliente | Média | Alto | Report-Only por 3–5 dias + teste automatizado |
| P3 | Cookie rejeitado no webview por origem diferente | Média | Bloqueante | Normalizar para `https://<domínio>` exato; teste de sessão |
| P4 | Follow-up dispara em dobro | Média | Crítico (queima cliente) | `Idempotency-Key` + unique + teste de reentrega |
| P5 | Follow-up não dispara e ninguém vê | Média | Alto (perde venda) | Teste "deveria ter disparado"; aviso na Central |
| P6 | `sem_automacao` ignorado em algum caminho | Média | Alto (mensagem indevida) | Checagem num único ponto + invariante |
| P7 | Duplicação de métrica de produção | Média | Médio (dois números) | Dashboard lê `lib/metrics` |
| P8 | Certificado atrasa e bloqueia entrega a cliente | Média | Médio | Iniciar M2.5 no dia 1; entregar sem assinatura só para teste interno |
| P9 | Fork diverge do upstream | Média | Alto | Merge trimestral + ADR-008 |
| P10 | Volume de 553 handlers para um nicho | Alta | Médio | Esconder por recurso (GN-17), nunca deletar |

---

## 8. Ordem de execução proposta para começar hoje

**Semana 1**
1. Você executa M0 (git + install + typecheck + unit) e me manda as saídas.
2. Eu escrevo o ADR-001 a ADR-010 e o documento de ambiente.
3. Eu abro a CSP em `Report-Only` com as origens corretas (M1), você aplica e observa 3–5 dias.

**Semana 2**
4. `enforce` da CSP após o relatório limpo.
5. Começo o `desktop/` (M2): main, preload, tela de conexão, validação de health.
6. Você empacota o primeiro `.exe` sem assinatura e testa na sua máquina.

**Semana 3–4**
7. Updater, tray, instância única, tratamento de erro de rede.
8. Início do M2.5 (certificado) — em paralelo, porque tem prazo externo.
9. Começo o M4 (migrations de etapa) enquanto o M2 estabiliza.

**Depois:** M5 → M6 (bloco crítico), M7, M8, M9.

---

## 9. O que eu preciso para iniciar a Fase 5

1. **Escolher Saída A ou B** (§1) — sem isso eu escrevo código que ninguém executa, e isso não é entrega.
2. **Rodar o M0** e me mandar a saída de `pnpm typecheck` e `pnpm test:unit`.
3. **Confirmar** que posso criar a pasta `desktop/` e o diretório `docs/graficacrm/` dentro do projeto.
4. **Dizer se quer que eu comece pela CSP (M1) ou pelo funil (M4)** enquanto o M0 roda. Recomendo CSP: é pré-requisito do shell, tem escopo pequeno e é o único item que pode **impedir** o app desktop de existir com segurança.

---

*Plano sujeito a revisão a cada marco concluído. Nenhuma alteração de infraestrutura, banco de produção ou VPS sem autorização escrita.*
