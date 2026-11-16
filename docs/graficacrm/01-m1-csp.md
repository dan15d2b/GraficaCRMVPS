# 01 — M1: Content-Security-Policy

> Estado: **entregue sem verificação de execução** (dono pediu para pular os testes).
> Pré-requisito do M2 (shell Electron), conforme D7 do `PLANO-EXECUCAO-FASE-4.md`.

## 1. O que mudou

### `next.config.ts`

Não foi criado um `headers()` novo — já existia. A CSP entrou como **mais um cabeçalho** no
bloco `source: "/(.*)"` que já servia `nosniff`, `X-Frame-Options`, `Referrer-Policy` e
`Permissions-Policy`.

| Diretiva | Valor | Por quê |
|---|---|---|
| `default-src` | `'self'` | Piso. Tudo que não está listado abaixo cai aqui. |
| `script-src` | `'self' 'unsafe-inline'` | App Router injeta hidratação inline; sem nonce (acoplaria `proxy.ts`), `'unsafe-inline'` é obrigatório nesta fase. |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind + estilos injetados por componente. |
| `img-src` | `'self' data: blob: <supabase>` | Preview de upload, avatares em base64, Storage assinado. |
| `connect-src` | `'self' <supabase>` | REST, Auth **e** Realtime (`wss://`). |
| `font-src` | `'self' data:` | Fontes self-hosted podem chegar como data URI. |
| `media-src` | `'self' blob: <supabase>` | Gravação PTT (blob URL) e mídia do bucket `whatsapp-media`. |
| `object-src` | `'none'` | Entrega #1 do plano. |
| `base-uri` | `'self'` | Bloqueia injeção de `<base>` que redirecionaria caminhos relativos. |
| `frame-ancestors` | `'none'` | Entrega #1. Redundante com `X-Frame-Options: DENY` de propósito — compatibilidade. |
| `form-action` | `'self'` | Impede POST de formulário para fora. |

### `<supabase>` não é curinga fixo

`origensDoSupabase()` em `next.config.ts` lê `NEXT_PUBLIC_SUPABASE_URL` (já é `ARG` do
`Dockerfile:25`) e emite o par exato — `https://host` **e** `wss://host` (`ws://` quando o
protocolo é `http://`), mais os curingas `*.supabase.co`/`*.supabase.in`.

O motivo é o self-host: numa VPS o Supabase pode ser `https://supabase.minhagrafica.com.br`,
e um `connect-src` só com curinga do Cloud bloquearia Realtime e Storage — inbox vazio, sem
erro óbvio para o operador. URL ausente ou inválida devolve `[]`, nunca `throw`: este arquivo
roda no `next build`.

### `lib/branding/logo-arquivo.ts`

O comentário que justificava banir SVG dizia "não há `Content-Security-Policy` neste
repositório: medido, `next.config.ts` não define `headers()` com CSP e não há `middleware.ts`".
A segunda metade estava **desatualizada desde antes deste marco** (`headers()` existe) e ficou
inteiramente falsa agora. Corrigido para descrever o estado real: CSP em `Report-Only`, que
ainda não bloqueia — a recusa de SVG permanece ativa até o enforce.

**Decisão que NÃO tomei:** reavaliar o banimento de SVG. É decisão do dono, depois do enforce.

### Teste

`tests/unit/csp-header-presente.test.ts` importa `next.config.ts`, chama `headers()` e
confere: o bloco `/(.*)` traz `Content-Security-Policy-Report-Only` com `default-src 'self'`,
`frame-ancestors 'none'`, `object-src 'none'` e `connect-src` com os curingas do Supabase
Cloud; e o bloco `/notify-sw.js` **não** carrega CSP (tem regras próprias).

## 2. O que falta para o enforce

1. **Rodar 3–5 dias em `Report-Only`** num ambiente com uso real: inbox com Realtime ativo,
   upload de logo, gravação PTT, editor de fluxo (`@xyflow/react`).
2. **Coletar as violações** no console do navegador (`Content Security Policy` / report-only).
   Não há endpoint de `report-uri` — por isso a coleta é manual.
3. **Corrigir o que aparecer** e só então trocar a chave de
   `Content-Security-Policy-Report-Only` para `Content-Security-Policy`.
4. **Não entra neste marco:** `nonce` por requisição ou `strict-dynamic`. Se depois do
   enforce sobrar `'unsafe-inline'` em `script-src`, viram o marco seguinte.

## 3. Riscos em aberto

| Risco | Estado |
|---|---|
| Realtime do Supabase bloqueado por `connect-src` incompleto | Mitigado por `origensDoSupabase()` + curinga. **Não testado por execução.** |
| Editor de fluxo `@xyflow/react` violar `style-src` | Provável: ele injeta estilos inline. `'unsafe-inline'` cobre. |
| `unsafe-inline` em `script-src` enfraquece a CSP contra XSS real | Aceito nesta fase; vira marco próprio. |
| Self-host com caminho `/supabase/` no mesmo domínio (proxy) | `origensDoSupabase()` usa `URL.host`, então cobre. Não testado. |
