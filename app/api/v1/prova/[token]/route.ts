import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { obterProvaPublica } from "@/lib/provas/servico";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { token } = await ctx.params;

  if (!token || typeof token !== "string") {
    return fail("validation_failed", "Token não informado.", 400, { requestId });
  }

  const prova = await obterProvaPublica(token);
  if (!prova) {
    return fail("not_found", "Prova digital não encontrada ou link expirado.", 404, { requestId });
  }

  return ok(prova, { requestId });
}
