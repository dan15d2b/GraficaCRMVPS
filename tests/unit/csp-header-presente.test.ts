/**
 * Garante que `Content-Security-Policy-Report-Only` sai de verdade da função
 * `headers()` do `next.config.ts` (M1 do GraficaCRM).
 *
 * Importa o módulo e CHAMA `headers()` — não faz varredura de texto. Varredura
 * de texto passa com `form-action 'self'X` (substring casa), e um teste que não
 * reprova não guarda nada.
 *
 * Se o header sumir, mudar de chave ou perder uma diretiva, este teste fica
 * vermelho antes do deploy.
 */
import { describe, expect, it } from "vitest";

import config from "../../next.config";

type Bloco = { source: string; headers: { key: string; value: string }[] };

async function blocos(): Promise<Bloco[]> {
  // `withSentryConfig` repassa `headers` sem alterar; se algum dia deixar de
  // repassar, o teste falha no `expect(blocos.length) > 0` abaixo — e isso é o
  // comportamento desejado, porque significa que a CSP deixou de ser servida.
  const h = (config as { headers?: () => Promise<Bloco[]> }).headers;
  expect(h, "next.config.ts não expõe headers()").toBeTypeOf("function");
  return h!.call(config);
}

function cspDo(bloco: Bloco): string | undefined {
  return bloco.headers.find((x) => x.key === "Content-Security-Policy-Report-Only")
    ?.value;
}

describe("CSP em next.config.ts (M1)", () => {
  it("o bloco /(.*) serve Content-Security-Policy-Report-Only", async () => {
    const global = (await blocos()).find((b) => b.source === "/(.*)");
    expect(global, "bloco source=/(.*) não encontrado").toBeDefined();
    expect(cspDo(global!), "CSP Report-Only ausente no bloco global").toBeTruthy();
  });

  it("traz as diretivas mínimas do M1", async () => {
    const global = (await blocos()).find((b) => b.source === "/(.*)")!;
    const csp = cspDo(global)!;
    // Diretivas exatas — `toContain` casaria `default-src 'self'X`.
    const diretivas = csp.split("; ").map((d) => d.trim());
    expect(diretivas).toContain("default-src 'self'");
    expect(diretivas).toContain("object-src 'none'");
    expect(diretivas).toContain("frame-ancestors 'none'");
    expect(diretivas).toContain("base-uri 'self'");
    expect(diretivas).toContain("form-action 'self'");
  });

  it("connect-src autoriza https E wss do Supabase (Realtime)", async () => {
    const global = (await blocos()).find((b) => b.source === "/(.*)")!;
    const connect = cspDo(global)!
      .split("; ")
      .find((d) => d.startsWith("connect-src"));
    expect(connect, "connect-src ausente").toBeTruthy();
    expect(connect).toContain("https://*.supabase.co");
    expect(connect).toMatch(/wss:\/\//);
  });

  it("origensDoSupabase acrescenta a origem exata do build (self-host)", async () => {
    // Com NEXT_PUBLIC_SUPABASE_URL definida, a origem exata tem que aparecer —
    // sem ela, o Supabase self-hosted (`supabase.minhagrafica.com.br`) seria
    // bloqueado e o Realtime da inbox morreria sem erro óbvio.
    const anterior = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.exemplo.test";
    try {
      const global = (await blocos()).find((b) => b.source === "/(.*)")!;
      const connect = cspDo(global)!
        .split("; ")
        .find((d) => d.startsWith("connect-src"))!;
      expect(connect).toContain("https://supabase.exemplo.test");
      expect(connect).toContain("wss://supabase.exemplo.test");
    } finally {
      if (anterior === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = anterior;
    }
  });

  it("continua em Report-Only — enforce não entrou antes do prazo", async () => {
    for (const bloco of await blocos()) {
      expect(
        bloco.headers.find((x) => x.key === "Content-Security-Policy"),
        `enforce CSP inesperado no bloco ${bloco.source}`,
      ).toBeUndefined();
    }
  });

  it("não regrediu X-Frame-Options nem microphone=(self)", async () => {
    const global = (await blocos()).find((b) => b.source === "/(.*)")!;
    const chaves = global.headers.map((h) => h.key);
    expect(chaves).toContain("X-Frame-Options");
    expect(chaves).toContain("Permissions-Policy");
    const perm = global.headers.find((h) => h.key === "Permissions-Policy")!.value;
    expect(perm).toContain("microphone=(self)");
  });
});


