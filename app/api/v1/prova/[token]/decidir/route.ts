import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { decidirProvaDigital } from "@/lib/provas/servico";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

const DecidirSchema = z.object({
  action: z.enum(["aprovar", "rejeitar"]),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { token } = await ctx.params;

  if (!token || typeof token !== "string") {
    return fail("validation_failed", "Token não informado.", 400, { requestId });
  }

  const body = await req.json().catch(() => null);
  const parsed = DecidirSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Ação inválida. Escolha 'aprovar' ou 'rejeitar'.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const clientUserAgent = req.headers.get("user-agent") || null;

  const resultado = await decidirProvaDigital({
    token,
    action: parsed.data.action,
    notes: parsed.data.notes,
    clientIp: clientIp ?? undefined,
    clientUserAgent: clientUserAgent ?? undefined,
    decidedVia: "link",
  });

  if (!resultado.ok) {
    const statusHttp =
      resultado.status === "not_found"
        ? 404
        : resultado.status === "already_decided"
          ? 409
          : 500;
    return fail(resultado.status, resultado.message, statusHttp, { requestId });
  }

  return ok(resultado, { requestId });
}
