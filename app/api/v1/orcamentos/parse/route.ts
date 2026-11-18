import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { fusoDaOrganizacao } from "@/lib/propostas/data-no-fuso";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsearOrcamentoTexto } from "@/lib/orcamentos/parser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "orcamentos" });
  if (!authz.ok) return authz.response;

  const contentType = req.headers.get("content-type") || "";
  let textoExtraido = "";

  const admin = createAdminClient();
  const fuso = await fusoDaOrganizacao(admin, authz.org.orgId);

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return fail("validation_failed", "Arquivo de orçamento (PDF) não informado.", 422, {
          requestId,
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      if (file.name.toLowerCase().endsWith(".pdf") || file.type.includes("pdf")) {
        textoExtraido = await extractPdfText(buffer);
      } else {
        // Se for arquivo de texto ou markdown
        textoExtraido = buffer.toString("utf-8");
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.text !== "string" || !body.text.trim()) {
        return fail("validation_failed", "Texto do orçamento não informado.", 422, {
          requestId,
        });
      }
      textoExtraido = body.text;
    }

    if (!textoExtraido.trim()) {
      return fail(
        "validation_failed",
        "Não foi possível extrair texto do documento ou o arquivo está vazio.",
        422,
        { requestId },
      );
    }

    const orcamento = await parsearOrcamentoTexto(textoExtraido, {
      organizationId: authz.org.orgId,
      fuso,
    });

    return ok(orcamento, { requestId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno ao processar orçamento.";
    return fail("internal_error", msg, 500, { requestId });
  }
}
