import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/** Performance budget (EPIC-12 §S-12.05):
 *  - LCP < 2.5s p75
 *  - CLS < 0.1 p75
 *  - INP < 200ms p75
 *  - Initial bundle /app/inbox < 250KB gzipped
 */
/**
 * A origem EXATA do Supabase, para a `connect-src` da CSP (M1).
 *
 * Os curingas `https://*.supabase.co` cobrem o Supabase Cloud, mas não o
 * self-host: aqui o Supabase pode ser `https://supabase.minhagrafica.com.br`,
 * e a CSP bloquearia Realtime e Storage — o operador veria inbox vazio sem
 * nenhum erro óbvio. Como o build JÁ recebe `NEXT_PUBLIC_SUPABASE_URL` como
 * `ARG` (Dockerfile:25), a origem sai daí e não de uma lista fixa.
 *
 * Devolve a origem em `https://` e em `wss://` (Realtime é WebSocket). Em
 * `http://` local, o par é `ws://`. Valor ausente ou inválido devolve `[]`:
 * o curinga continua sendo a defesa, nunca um `throw` — este arquivo roda no
 * `next build` e um throw aqui é build quebrado em toda instalação.
 */
function origensDoSupabase(): string[] {
  const bruto = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!bruto) return [];
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];
  const ws = url.protocol === "https:" ? "wss:" : "ws:";
  return [`${url.protocol}//${url.host}`, `${ws}//${url.host}`];
}

/**
 * Origens do Supabase Cloud (curinga) + a origem exata desta instalação.
 *
 * Calculado DENTRO de `headers()` e não no load do módulo: assim o teste unitário
 * consegue injetar `NEXT_PUBLIC_SUPABASE_URL` e provar que a origem exata entra
 * na CSP — que é o que impede o Realtime do self-host de ser bloqueado.
 */
function origensSupabase(): string {
  return [
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.supabase.in",
    "wss://*.supabase.in",
    ...origensDoSupabase(),
  ].join(" ");
}

const nextConfig: NextConfig = {
  // Self-host: gera .next/standalone pro container Docker (node server.js) — é
  // o que o estágio `runner` do Dockerfile copia, então é o modo de build deste
  // repositório. O ramo de `process.env.VERCEL` é resíduo defensivo, não um modo
  // suportado aqui: onde essa variável existe, o standalone precisa ficar
  // desligado porque Next 16.3 + adapter + standalone quebra o onBuildComplete
  // com ENOENT next-server.js.nft.json (#96646).
  output: process.env.VERCEL ? undefined : "standalone",
  /**
   * O `standalone` copia SÓ o que o file tracing detecta — e ele não detecta
   * tudo de `@swc/helpers`.
   *
   * Medido no build da `main`: o pacote real tem 108 arquivos em `esm/`, e o
   * standalone levava **2**. Em runtime o Node pedia
   * `@swc/helpers/esm/_interop_require_default`, não achava, e o container
   * subia em crashloop com `MODULE_NOT_FOUND` — a imagem construía, publicava e
   * só morria ao dar `docker compose up` na VPS.
   *
   * Não aparecia no `next@16.3.0`: aquela versão resolvia o helper pelo CJS. O
   * bump para `16.3.1` passou a resolvê-lo por `exports`/ESM, e o buraco do
   * trace virou falha dura. Como o helper é injetado pelo COMPILADOR (nenhum
   * arquivo nosso o importa), não há import para o trace seguir — a inclusão
   * precisa ser declarada.
   *
   * O glob passa pelo layout do pnpm (`.pnpm/@swc+helpers@<versão>/…`) porque é
   * onde o pacote realmente mora aqui; o `*` cobre o bump de versão seguinte
   * sem exigir que alguém lembre de editar esta linha.
   *
   * TERCEIRO padrão, medido numa instalação real em 2026-09-17: o próprio
   * `pdfjs-dist` (35 MB / 554 arquivos em `.pnpm`) sai do standalone **inteiro**
   * — 0 arquivos —, não só o binário nativo do canvas. `extractPdfText`
   * (lib/ai/rag/extractors/pdf.ts) importa `"pdfjs-dist/legacy/build/pdf.mjs"`
   * por STRING LITERAL, e mesmo assim o tracer não segue: esse subpath não
   * está no mapa de `exports` do `package.json` do pacote, então o NFT não
   * tem como validar a resolução e não inclui nenhum arquivo do pacote — não
   * é o mesmo defeito parcial do `@swc/helpers` (que perdia 106 de 108
   * arquivos), é ausência total. Efeito em produção: toda tentativa de
   * ensinar o agente com PDF cai no catch de `PdfExtractError` com
   * "Cannot find package 'pdfjs-dist'", e `lib/ai/rag/ingest/documento.ts`
   * reembala isso na mensagem genérica de "só imagens escaneadas" — o
   * operador não tinha como saber que o problema era o build, não o arquivo.
   */
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**",
      // Mesmo defeito do @swc/helpers acima: js-binding.js do @napi-rs/canvas
      // resolve o binário nativo com `require()` computado em runtime
      // (process.platform/isMusl()), então o tracer não o segue e o
      // standalone sobe sem o binário — pdfjs-dist quebra no import com
      // "DOMMatrix is not defined" (lib/ai/rag/extractors/pdf.ts).
      //
      // São DOIS padrões, e o motivo de não ser um `@napi-rs/**` só está
      // medido: dentro de `@napi-rs/` o pnpm põe, ao lado do pacote real, um
      // SYMLINK por plataforma (`canvas-linux-x64-gnu` ->
      // `../../../@napi-rs+canvas-linux-x64-gnu@…`). O glob casa o symlink, o
      // Turbopack tenta lê-lo como arquivo para calcular o hash do
      // `.nft.json`, e o build morre com `Is a directory (os error 21)` —
      // não no import, no EMIT. Apontando para o conteúdo de cada pacote em
      // vez de para o diretório que os agrega, nenhum symlink é visitado.
      "./node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**",
      "./node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/*/*.node",
      // pdfjs-dist em si (ver comentário acima).
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**",
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes moved out of experimental in Next 15.5+
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "lucide-react", "date-fns"],
  },
  images: {
    // O app não usa next/image de fato (só <img> raw); desligar o otimizador
    // evita exigir o binário `sharp` no runtime do container.
    unoptimized: true,
    remotePatterns: [
      // Supabase Storage (assinado)
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  async headers() {
    return [
      {
        source: "/notify-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=(self): o gravador de voz do composer (PTT estilo WhatsApp)
          // usa getUserMedia({audio}); microphone=() bloquearia em TODA origem,
          // inclusive a própria — daria "microphone is not allowed in this document".
          // Câmera e geolocalização seguem bloqueadas (não usadas).
          // notifications=(self): bandeja do SO quando a janela está minimizada.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), notifications=(self)",
          },
          // CSP — M1 (GraficaCRM). Em Report-Only por 3–5 dias antes do enforce.
          //
          // script-src 'unsafe-inline': Next.js App Router injeta scripts de
          // hidratação inline. Sem nonce (acoplaria proxy.ts) e sem hash estático
          // (o conteúdo muda a cada build), 'unsafe-inline' é obrigatório nesta fase.
          // Retirar depois do enforce, com nonce ou strict-dynamic.
          //
          // connect-src wss://*.supabase.co|.in: Supabase Realtime usa WebSocket.
          // media-src blob: https://*.supabase.co|.in: gravação PTT (blob URL) e
          // download de mídia do bucket de WhatsApp.
          // img-src data: blob:: previews de upload e avatares em base64.
          // font-src data:: algumas fontes self-hosted chegam como data URI.
          //
          // ponytail: nonce por requisição (proxy.ts), strict-dynamic, report-uri
          // real (hoje sem endpoint). Adicionar quando enforce for estável.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: ${origensSupabase()}`,
              `connect-src 'self' ${origensSupabase()}`,
              "font-src 'self' data:",
              `media-src 'self' blob: ${origensSupabase()}`,
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "automatik-labs",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Herança do wizard do Sentry (instrumentação automática de cron monitors).
    // Inerte aqui: o bloco `webpack:` inteiro é ignorado pelo build de produção,
    // que roda Turbopack (ver Dockerfile). Fica como resíduo defensivo, não como
    // modo de build suportado por este repositório.
    // https://docs.sentry.io/product/crons/
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
