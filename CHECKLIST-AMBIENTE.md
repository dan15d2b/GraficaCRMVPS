# CHECKLIST DE AMBIENTE — o que precisa existir para o GráficaCRM ser construído até o fim

**Para:** brito
**Data:** 08/11/2026
**Objetivo:** tudo que precisa estar instalado, configurado ou autorizado para eu conseguir construir, testar e entregar o sistema completo.

Leia em ordem. As seções 1 e 2 travam **tudo**; as seguintes travam partes.

---

## 1. Acesso de rede para eu trabalhar (bloqueado hoje)

Testei agora: `npm view next version` → **403 do proxy**. Sem isto eu não instalo uma única dependência.

### Hosts a liberar na allowlist de egress

Onde fica: **menu do usuário → Setup / Configuração → Inference configuration → Capabilities → General restrictions → Allowed egress hosts**. Aplicar e **reiniciar o app**.

Cole exatamente estes (um por linha, sem `https://`):

```
registry.npmjs.org
```

Núcleo — sem isso, nada. Instalar dependências.

```
github.com
codeload.github.com
objects.githubusercontent.com
raw.githubusercontent.com
```

Necessário para clonar o repositório e acompanhar o upstream (`git fetch`, `git merge origin/main`) — é o que impede o GráficaCRM de virar fork órfão.

```
cdn.playwright.dev
playwright.azureedge.net
playwright.download.prss.microsoft.com
```

Só se quiser que eu rode testes de navegador (Playwright). Pode ficar para depois.

```
api.github.com
```

Para consultar releases/PRs do upstream sem clonar tudo.

**Se a tela não existir na sua versão do app**, me diga o que aparece em Setup — pode ter mudado de nome ou de lugar. Você mencionou antes que não achou; a lista acima só serve se a tela existir.

### Alternativa se a allowlist não existir

Você roda os comandos na sua máquina e me manda a saída. Funciona, mas cada verificação vira uma ida e volta — é o que faz o projeto demorar 3× mais. Prefira a allowlist.

---

## 2. Instalações na sua máquina Windows (ou na que vai rodar o build)

O build do `.exe` **só acontece em Windows**. Mesmo com rede liberada para mim, o instalador tem de ser gerado na sua máquina (ou num runner Windows de CI). Esta seção não tem como ser pulada.

| # | Ferramenta | Como instalar | Para quê |
|---|---|---|---|
| 1 | **Node.js 22 LTS** | https://nodejs.org (escolha 22.x, não 24) | O projeto exige `>=22`; o `.nvmrc` fixa 22 |
| 2 | **pnpm 9.15.9** | `corepack enable` e depois `corepack prepare pnpm@9.15.9 --activate` | É o gerenciador do projeto (`packageManager` no `package.json`); **não use npm** |
| 3 | **Git para Windows** | https://git-scm.com | Versionamento e merge do upstream |
| 4 | **Docker Desktop** | https://docker.com | Subir WAHA + Redis + Supabase local para testar WhatsApp de verdade |
| 5 | **Visual Studio Build Tools** (C++ Workload) | No instalador do VS, marcar "Desenvolvimento para desktop com C++" | Dependências nativas do Electron/Node no Windows |
| 6 | **PowerShell 7** | `winget install Microsoft.PowerShell` | Scripts de build/assinatura |
| 7 | **WiX ou NSIS** | Vem no `electron-builder`; nada a instalar | Empacotar o instalador |

Conferir depois de instalar (no PowerShell):

```powershell
node -v          # v22.x
corepack pnpm -v # 9.15.9
git --version
docker --version
```

---

## 3. Preparar o projeto (uma vez, ~1,2 GB de download)

Na pasta `C:\Users\brito\Desktop\DeskcommCRM-main`:

```powershell
# 1. Versionar (a pasta atual é um ZIP sem .git — não tem histórico)
git init
git remote add upstream https://github.com/melgarafael/DeskcommCRM.git
git fetch upstream --depth=1
git add -A
git commit -m "snapshot: DeskcommCRM base para o GraficaCRM"

# 2. Instalar dependências
corepack pnpm install

# 3. Provar que o ambiente está são
corepack pnpm typecheck
corepack pnpm test:unit
```

**Me mande a saída dos dois últimos comandos.** É o marco M0: sem isso eu não sei se a base compila na sua máquina, e escrever código sobre uma base que não compila é escrever no escuro.

Tempo estimado: 15–30 min (o install é o demorado).

---

## 4. Serviços externos que o sistema usa (contas e chaves)

O DeskcommCRM não funciona sem estes. Nenhum deles exige pagamento para começar, exceto os marcados.

### 4.1 Banco e autenticação — obrigatório

Duas opções. Recomendo a segunda para produção.

| Opção | O que é | Custo |
|---|---|---|
| **Supabase Cloud** | Projeto hospedado, mais rápido de começar | Grátis até certo limite; Pro US$ 25/mês |
| **Supabase self-hosted** (via Docker) | Roda na sua VPS junto do app; é o caminho que o instalador do projeto usa | Só a VPS |

Para desenvolvimento local, o Docker Desktop sobe o Supabase local automaticamente (`scripts/local-supabase.sh`).

**O que preciso:** a `SUPABASE_URL`, a `SUPABASE_ANON_KEY` e a `SUPABASE_SERVICE_ROLE_KEY` — **nunca no chat nem no código**. Elas ficam no `.env.local` da sua máquina, que não entra no git.

### 4.2 WhatsApp — obrigatório para o produto funcionar

| Caminho | O que precisa | Custo |
|---|---|---|
| **WAHA Plus** (não oficial, o que o produto usa) | Licença WAHA Plus + um número de WhatsApp dedicado (chip novo, nunca o principal da gráfica) | ~US$ 19/mês + chip |
| **Meta Cloud API** (oficial) | Conta Meta Business, número verificado, templates aprovados | Grátis até 1.000 conversas/mês |

**O que preciso:** a URL do WAHA e a API key dele (no `.env.local`), e um número de teste. Sem WhatsApp eu não consigo provar nenhuma funcionalidade de atendimento — e é o coração do sistema.

### 4.3 Inteligência artificial — obrigatório para os agentes

| Provedor | O que precisa | Custo |
|---|---|---|
| **Anthropic** (recomendado como primário) | API key | Por token (~US$ 3–15 por milhão) |
| OpenAI ou Google | API key, se quiser alternativa/embeddings | Por token |

O projeto usa o Vercel AI Gateway ou chamada direta. Para desenvolvimento, uma chave da Anthropic com limite de gasto baixo basta.

**O que preciso:** a chave no `.env.local`. Recado importante: eu não devo e não vou recebê-la no chat.

### 4.4 Redis — recomendado

| Opção | Custo |
|---|---|
| Upstash (free tier) | Grátis |
| Redis local via Docker | Grátis |

Sem ele o sistema degrada (rate limit em memória), mas funciona.

### 4.5 Opcionais (deixe para depois)

Resend (e-mail), Sentry (erros), Nuvemshop, Google Calendar, Stripe/Asaas, Asterisk. Nenhum bloqueia o desenvolvimento.

---

## 5. Assinatura de código (necessário antes do primeiro cliente)

| Item | Detalhe |
|---|---|
| O que | Certificado **OV Code Signing**, com assinatura em nuvem (HSM) — não token USB |
| Onde | DigiCert KeyLocker, SSL.com eSigner, Sectigo ou equivalente |
| Requisito | **CNPJ ativo** + documentação da empresa; validação leva de dias a semanas |
| Custo | R$ 1.000–2.200/ano |
| Por que não EV | Desde 2024 o EV não dispensa mais o SmartScreen imediatamente; o prêmio não se paga |
| Por que não Azure Trusted Signing | US$ 10/mês, mas **não disponível para empresas no Brasil** |
| Quando começar | **Agora**, em paralelo — é o item de maior prazo externo do projeto |

Sem o certificado, o app funciona na sua máquina, mas em qualquer outra o Windows mostra "editor desconhecido". Não impede o desenvolvimento; impede a venda.

---

## 6. Autorizações que só você pode dar

Marque o que autoriza. Sem isto eu paro em cada marco.

| # | Autorização | Estado |
|---|---|---|
| A1 | Criar as pastas `desktop/` e `docs/graficacrm/` dentro do projeto | ⬜ |
| A2 | Alterar `next.config.ts` e `proxy.ts` para adicionar CSP | ⬜ |
| A3 | Criar migrations e atualizar `supabase/baseline.sql` (schema local, nunca produção) | ⬜ |
| A4 | Rodar `docker compose` local para WAHA/Redis/Supabase | ⬜ |
| A5 | Instalar dependências npm no projeto | ⬜ |
| A6 | Criar o repositório remoto `graficacrm` (se quiser backup fora da máquina) | ⬜ |
| A7 | Acessar a VPS de teste para instalar e validar o app (quando existir) | ⬜ |
| A8 | Contratar/ iniciar o processo do certificado de assinatura | ⬜ |

**Não autorizo por você, e não vou:** tocar em produção, alterar a VPS atual, apagar dados, publicar instalador para terceiros.

---

## 7. O que eu faço sozinho, sem você

Para você saber o que não precisa decidir:

- Escrever código de cada módulo (desktop, CSP, funil, follow-up, catálogo, produção).
- Escrever migrations, com `-- manifest:` e apêndice idempotente no baseline.
- Escrever testes (unit, invariante, E2E).
- Escrever a documentação e os ADRs.
- Revisar o código existente e apontar regressões.
- Propor desenho de tela e identidade.

## 8. O que depende de você, sempre

- Rodar build e testes no Windows (ou liberar rede para eu rodar typecheck/unit).
- Fornecer as chaves dos serviços (no `.env.local`, não no chat).
- Aprovar mudanças de schema e de comportamento comercial.
- Testar pela tela como usuário real (a doutrina do projeto exige, e eu não tenho Windows).

---

## 9. Resumo: o mínimo para eu começar hoje

Só três coisas, nesta ordem:

1. **Liberar `registry.npmjs.org`** (+ `github.com`, `codeload.github.com`) e reiniciar o app.
2. **Rodar o bloco da seção 3** na sua máquina e me mandar a saída de `pnpm typecheck` e `pnpm test:unit`.
3. **Autorizar A1, A2 e A3** (pastas, CSP, migrations).

Com isso eu começo o M1 (CSP) e sigo para o shell. O resto — chaves, WhatsApp, certificado — entra quando cada marco precisar, e eu te aviso antes de cada um.

---

### Uma nota sobre o que "até o final" significa em tempo

Com ambiente completo e você respondendo rápido: **12 a 17 dias úteis** até o app instalado e usando; **mais 32 a 44** até a operação gráfica completa. Sem a liberação de rede, some 2–3× a isso, porque cada verificação espera você. Não estou inflando: é a consequência de 11 marcos e ~1M de linhas com a regra de testar antes de declarar pronto.
