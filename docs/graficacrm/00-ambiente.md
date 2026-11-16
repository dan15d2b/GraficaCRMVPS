# 00 — Ambiente do GraficaCRM

> Medido nesta máquina em **2026-11-08/09** (`c:\Users\brito\Desktop\DeskcommCRM-main`).
> Números vieram de comando, não de memória. Onde não medi, está escrito **não medido**.
> Precedência de doutrina: `CLAUDE.md` > `docs/specs/` > `docs/prd/` > `HANDOFF-*.md` > `README.md`.

## 1. Versões medidas (CONFIRMADO)

| Item | Valor |
|---|---|
| Node | `v26.13.0` |
| pnpm | `9.15.9` (instalado via `npm -g`, **sem** corepack) |
| `git` | fora do PATH; binário em `C:\Program Files\Git\cmd\git.exe` |
| HEAD | `1d61940e` — "snapshot: DeskcommCRM base para o GraficaCRM" |
| Remote | `upstream` → `https://github.com/melgarafael/DeskcommCRM.git` |
| RAM | 15,7 GB |
| Rede para `registry.npmjs.org` | HTTP 200 |
| `pnpm install --frozen-lockfile` | verde |
| `pnpm typecheck` | **exit 0**, zero erros |

⚠️ **Divergência de runtime:** o projeto fixa **Node 22** (`.nvmrc`, `engines`, workflows).
Aqui roda **Node 26**. `fnm 1.39.0` está instalado, mas `$PROFILE` do PowerShell não existe —
nada persiste entre sessões.

## 2. Peculiaridades desta máquina (não redescobrir)

**a) `tsc` estoura a heap.** Sem ajuste: `exit 134`, `Ineffective mark-compacts near heap limit`.
A falha **parece** erro de projeto e não é. Sempre:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=8192'
```

**b) `date-fns@4.4.0` corrompido no store do pnpm.** Sintoma: 75 erros de TS apontando
`index.d.ts` reexportando de `./format.ts` com os `.d.ts`/`.js` ausentes no disco — o store
considerava íntegro um download truncado. Conserto: `pnpm install --force`.

**c) `git` fora do PATH.** Toda sessão nova precisa:

```powershell
$env:Path += ';C:\Program Files\Git\cmd'
```

## 3. Comandos que funcionaram (reproduzir do zero)

```powershell
$env:Path += ';C:\Program Files\Git\cmd'
$env:NODE_OPTIONS='--max-old-space-size=8192'
pnpm install --frozen-lockfile
pnpm typecheck
```

## 4. `pnpm test:unit` — interrompido, NÃO é falha

Suíte grande: **3.353** arquivos `.test.ts`/`.test.tsx`, menos os excluídos
(`tests/e2e/**`, `tests/invariants/**`, `tests/journeys/**` — `vitest.config.ts:33`).
Rodou ~60 min e não terminou; o dono decidiu pular a execução completa.

- Falha real observada, única: `tests/unit/standalone-canvas-closure.test.ts` —
  `a receita Docker conserva o alvo do symlink do canvas e seu binding instalado`.
  É sobre a receita do Dockerfile; não toca CSP nem typecheck.
- Muitos `error`/`warn` no stdout são **dublês e asserções** dos próprios testes.
- O rodapé `Test Files` / `Tests` **nunca apareceu** — não há resultado final para citar.

## 5. Restrição declarada pelo dono

Execução de testes fica **pulada** por decisão dele (`"Pule os testes!"`). Isso não remove a
obrigação de escrever o teste: a suíte será rodada na máquina/VPS dele quando ele quiser.
Todo marco entregue aqui sai marcado como **entregue sem verificação de execução**, com o
motivo escrito — nunca como concluído.
