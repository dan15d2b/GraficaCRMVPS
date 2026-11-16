# HANDOFF â€” GraficaCRM Â· M0 fechado, M1 pronto para comeÃ§ar

> Medido em 2026-11-08 nesta mÃ¡quina (`c:\Users\brito\Desktop\DeskcommCRM-main`).
> NÃºmeros abaixo vieram de comando, nÃ£o de memÃ³ria. Onde nÃ£o medi, estÃ¡ escrito **nÃ£o medido**.
> Doutrina do repo vale: `CLAUDE.md` > `docs/specs/` > `docs/prd/` > `HANDOFF-*.md` > `README.md`.

## Estado em uma linha

`pnpm install` e `pnpm typecheck` **verdes**. `pnpm test:unit` foi **interrompido por decisÃ£o do dono** (nÃ£o falhou â€” ver Â§4).
M1 (CSP) pode comeÃ§ar assim que A1/A2 forem autorizadas.

---

## 1. Ambiente medido (CONFIRMADO por comando)

| Item | Valor medido |
|---|---|
| Node | `v26.13.0` |
| pnpm | `9.15.9` (instalado via `npm -g`, **sem** corepack) |
| `git` | **fora do PATH**; binÃ¡rio em `C:\Program Files\Git\cmd\git.exe` |
| HEAD | `1d61940e` â€” "snapshot: DeskcommCRM base para o GraficaCRM" |
| Remote | `upstream` â†’ `https://github.com/melgarafael/DeskcommCRM.git` (**jÃ¡ existe**; o M0 dÃ¡ isso por feito) |
| RAM | 15,7 GB |
| Rede para `registry.npmjs.org` | HTTP 200 |

âš ï¸ **DivergÃªncia de runtime:** o projeto fixa **Node 22** (`.nvmrc`, `engines`, e os workflows fixam `node-version: 22`). Aqui roda Node 26. Typecheck passou assim, mas **build e CI usam 22** â€” comportamento diferente Ã© possÃ­vel. `fnm 1.39.0` estÃ¡ instalado, mas `$PROFILE` do PowerShell **nÃ£o existe** (nada persiste entre sessÃµes).

## 2. Dois problemas de ambiente que jÃ¡ custaram caro (nÃ£o redescobrir)

**a) `tsc` estoura a heap nesta mÃ¡quina.** Sem ajuste: `exit 134`, `Ineffective mark-compacts near heap limit`. A falha **parece erro de projeto** e nÃ£o Ã©. Sempre:
```powershell
$env:NODE_OPTIONS='--max-old-space-size=8192'
```

**b) `date-fns@4.4.0` estava corrompido no store do pnpm.** 75 erros de TS que pareciam do projeto: `index.d.ts` reexportava de `./format.ts` com os `.d.ts`/`.js` ausentes no disco â€” download truncado que o store considerava Ã­ntegro. Conserto aplicado:
```powershell
pnpm install --force
```
Sintoma a lembrar: 144 arquivos `.js` em vez de 252. O `node_modules` antes disso era **install interrompido** (sÃ³ `.pnpm` com 954 pacotes, sem `next`, sem `typescript`, sem `.bin`) â€” nÃ£o era "populado" nem "vazio".

## 3. PrecedÃªncia de setup (reproduzir do zero)

```powershell
$env:Path += ';C:\Program Files\Git\cmd'      # git fora do PATH
$env:NODE_OPTIONS='--max-old-space-size=8192' # obrigatÃ³rio nesta mÃ¡quina
pnpm install --frozen-lockfile
pnpm typecheck                                 # exit 0, zero erros
```

## 4. `pnpm test:unit` â€” interrompido, NÃƒO Ã© falha

A suÃ­te Ã© grande: **3.353** arquivos `.test.ts`/`.test.tsx` no repo, menos os excluÃ­dos de propÃ³sito (`tests/e2e/**`, `tests/invariants/**`, `tests/journeys/**` â€” `vitest.config.ts:33`). Roda em dois projetos: `cercas` (node) e `produto` (jsdom).

Rodou ~60 min e nÃ£o terminou nesta mÃ¡quina; o dono decidiu **pular**. Log parcial em `%TEMP%\cline\test-unit.txt` (~4,5 MB).

- **Falha real observada, Ãºnica:** `tests/unit/standalone-canvas-closure.test.ts` â€” 1 teste, `a receita Docker conserva o alvo do symlink do canvas e seu binding instalado`. Ã‰ sobre a receita do Dockerfile; nÃ£o toca CSP nem typecheck. **Investigar antes de presumir que Ã© ambiente.**
- O log contÃ©m **muitos** `error`/`warn` de stdout dos prÃ³prios testes (`fetch failed`, `relation does not exist`, `db_error`) â€” sÃ£o **dublÃªs e asserÃ§Ãµes**, nÃ£o falhas.
- âš ï¸ **11 processos `node` ficaram pendurados** daquela execuÃ§Ã£o. Matar antes de rodar algo pesado.
- O rodapÃ© `Test Files` / `Tests` que a doutrina exige **nunca apareceu** â€” nÃ£o hÃ¡ resultado final para citar. NÃ£o invente um.

## 5. M1 â€” CSP (o trabalho em si)

Fonte Ãºnica: [`PLANO-EXECUCAO-FASE-4.md`](PLANO-EXECUCAO-FASE-4.md) linhas 132â€“150. **2â€“3 dias, risco alto, escopo pequeno.**

| # | Entrega | CritÃ©rio |
|---|---|---|
| 1 | CSP em `next.config.ts` (`headers()`) | `/app/inbox` responde com `Content-Security-Policy` contendo `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` |
| 2 | Origens do Supabase explÃ­citas | `connect-src` com `https://<supabase>` **e** `wss://<supabase>`; Realtime conecta sem erro no console |
| 3 | Storage liberado | imagem do bucket carrega por URL assinada |
| 4 | RSC/streaming sem `unsafe-eval` | pÃ¡gina carrega, zero `EvalError` |
| 5 | Microfone do composer | gravaÃ§Ã£o PTT grava e envia |
| 6 | `report-only` primeiro | 3â€“5 dias de relatÃ³rio antes do enforce, se houver tempo |
| 7 | Teste automatizado | falha se o header sumir de rota crÃ­tica |

**NÃ£o entra:** nonce dinÃ¢mico por requisiÃ§Ã£o â€” acopla `proxy.ts` e complica cache. `'self'` + origens explÃ­citas primeiro.

### CorreÃ§Ã£o de premissa (CONFIRMADO lendo o cÃ³digo, nÃ£o o plano)

O plano, e o comentÃ¡rio em `lib/branding/logo-arquivo.ts:19-21`, dizem que "`next.config.ts` nÃ£o define `headers()` com CSP". A **segunda metade estÃ¡ desatualizada**: `next.config.ts:92` **jÃ¡ tem** um `headers()`, servindo hoje:

- `/notify-sw.js` â†’ `Cache-Control: no-cache`, `Service-Worker-Allowed: /`
- `/(.*)` â†’ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=(), notifications=(self)`

O que **Ã©** verdade: nÃ£o existe `Content-Security-Policy` em lugar nenhum, e `proxy.ts` nÃ£o menciona CSP nem nonce (medido por busca).

ConsequÃªncias para o M1:
- NÃ£o Ã© criar `headers()` â€” Ã© **acrescentar a diretiva** ao bloco `source: "/(.*)"` existente.
- `X-Frame-Options: DENY` Ã© **redundante com** `frame-ancestors 'none'` e deve ficar (compatibilidade) â€” nÃ£o Ã© bug.
- `Permissions-Policy` jÃ¡ libera `microphone=(self)`; entrega #5 Ã© **nÃ£o causar regressÃ£o**, nÃ£o construir nada.
- **Entrega extra nÃ£o prevista no plano:** atualizar o comentÃ¡rio de `lib/branding/logo-arquivo.ts` (linhas 19â€“21). Depois do enforce, reavaliar o banimento de SVG Ã© decisÃ£o do dono â€” nÃ£o do agente.

## 6. Bloqueio atual â€” autorizaÃ§Ãµes

`CHECKLIST-AMBIENTE.md` Â§6, linha 181, Ã© explÃ­cito: *"Marque o que autoriza. Sem isto eu paro em cada marco."*

| # | AutorizaÃ§Ã£o | Estado |
|---|---|---|
| A1 | Criar `desktop/` e `docs/graficacrm/` | â¬œ **nÃ£o autorizada** |
| A2 | Alterar `next.config.ts` e `proxy.ts` para adicionar CSP | â¬œ **nÃ£o autorizada** |

**Nada foi editado neste trabalho** â€” sÃ³ este handoff. A2 Ã© prÃ©-requisito do M1; A1 bloqueia o entregÃ¡vel `docs/graficacrm/00-ambiente.md` do M0 (por isso este arquivo ficou na raiz, como `HANDOFF-*.md`).

## 7. PendÃªncias do working tree (nÃ£o commitar sem decisÃ£o)

`git status` tem 4 entradas:

- ` M CLAUDE.md` â€” **ediÃ§Ã£o nÃ£o intencional de outro agente**: inseriu a linha `Sempre salvar arquivo Memory.MD` no topo da doutrina. `CLAUDE.md` Ã© a autoridade final do repo; decidir **reverter** ou **formalizar**. NÃ£o reverti por conta prÃ³pria.
- `?? .pnpm-store/` â€” o store do pnpm estÃ¡ **dentro do repo**, nÃ£o global. Devia estar no `.gitignore` num repo distribuÃ­do como cÃ³digo.
- `?? _tmp_3_69680d2eb7ebedf51ca075886bbd17d2` e `?? _tmp_3_bdf3dcf0f8f7095ac1d2b3071bb33b6a` â€” lixo temporÃ¡rio, remover.

## 8. PrÃ³ximos passos, na ordem

1. Matar os 11 processos `node` pendurados do vitest.
2. Decidir o `CLAUDE.md` do Â§7 (reverter a linha, ou formalizar como instruÃ§Ã£o do projeto).
3. Tratar `standalone-canvas-closure.test.ts` â€” Ãºnico teste que falhou de fato.
4. Pedir **A1** e **A2** ao dono; marcar em `CHECKLIST-AMBIENTE.md` Â§6.
5. Com A1: criar `docs/graficacrm/` e mover este conteÃºdo para `docs/graficacrm/00-ambiente.md`. Com A2: implementar o M1 comeÃ§ando em `Content-Security-Policy-Report-Only`.
6. Fixar no `$PROFILE` do PowerShell (hoje **nÃ£o existe**), para nÃ£o redescobrir o heap a cada sessÃ£o:
   ```powershell
   if (!(Test-Path $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force }
   Add-Content $PROFILE '$env:NODE_OPTIONS="--max-old-space-size=8192"'
   Add-Content $PROFILE 'fnm env | Out-String | Invoke-Expression'
   ```

## 9. Artefatos GraficaCRM jÃ¡ presentes no repo

`INVENTARIO_GRAFICACRM.md`, `ARQUITETURA-GRAFICACRM-FASE-3.md`, `PLANO-EXECUCAO-FASE-4.md`, `RELATORIO-FASE-1-AUDITORIA.md`, `RELATORIO-W1-GATILHOS.md`, `CHECKLIST-AMBIENTE.md`, `tema-graficacrm.html`.

Nota: `project_graficacrm_estado.md`, `project_graficacrm_ambiente.md` e `feedback_graficacrm_estilo.md` **nÃ£o estÃ£o** no repo nem em `Desktop` (2 nÃ­veis) â€” provavelmente no diretÃ³rio de memÃ³ria do agente, nÃ£o versionados.

```powershell
$env:Path += ';C:\Program Files\Git\cmd'      # git fora do PATH
$env:NODE_OPTIONS='--max-old-space-size=8192' # obrigatÃ³rio nesta mÃ¡quina
pnpm install --frozen-lockfile
pnpm typecheck                                 # exit 0, zero erros
```

