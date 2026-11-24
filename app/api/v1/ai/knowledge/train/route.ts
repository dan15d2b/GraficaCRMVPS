import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const trainAgentSchema = z.object({
  agent_id: z.string().uuid(),
  version_id: z.string().uuid().optional(),
  question: z.string().trim().min(2, "A pergunta deve ter pelo menos 2 caracteres."),
  answer: z.string().trim().min(2, "A resposta esperada deve ter pelo menos 2 caracteres."),
  tags: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  let input: z.infer<typeof trainAgentSchema>;
  try {
    const raw = await req.json();
    input = trainAgentSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("validation_error", "Dados de treinamento inválidos.", 400, {
        requestId,
        details: err.flatten(),
      });
    }
    return fail("bad_request", "Corpo da requisição inválido.", 400, { requestId });
  }

  const admin = createAdminClient();
  const sourceName = "Treinamento do Atendente (Regras e Correções)";

  // 1. Localiza ou cria a fonte de conhecimento de treinamento
  const { data: fontesExistentes } = await admin
    .from("ai_knowledge_sources")
    .select("id, chunks_count")
    .eq("organization_id", activeOrg.orgId)
    .eq("name", sourceName)
    .eq("is_active", true)
    .limit(1);

  let sourceId: string;
  let currentChunks = 0;

  if (fontesExistentes && fontesExistentes.length > 0 && fontesExistentes[0]) {
    sourceId = fontesExistentes[0].id;
    currentChunks = fontesExistentes[0].chunks_count ?? 0;
  } else {
    const { data: novaFonte, error: novaFonteErr } = await admin
      .from("ai_knowledge_sources")
      .insert({
        organization_id: activeOrg.orgId,
        agent_id: input.agent_id,
        source_type: "faq",
        name: sourceName,
        status: "ready",
        is_active: true,
        source_metadata: { origem: "treinamento_interativo_chat" },
        ingested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (novaFonteErr || !novaFonte) {
      console.error("[train] Falha ao criar fonte de treinamento:", novaFonteErr?.message);
      return fail("internal_error", "Erro ao criar fonte de treinamento.", 500, { requestId });
    }
    sourceId = novaFonte.id;
  }

  // 2. Insere a pergunta e a resposta corrigida em ai_faq_items
  const { error: insertErr } = await admin.from("ai_faq_items").insert({
    organization_id: activeOrg.orgId,
    knowledge_source_id: sourceId,
    question: input.question,
    answer: input.answer,
    tags: input.tags.length > 0 ? input.tags : ["treinamento-chat"],
    locale: "pt-BR",
    position: currentChunks,
  });

  if (insertErr) {
    console.error("[train] Falha ao salvar par FAQ:", insertErr.message);
    return fail("internal_error", "Erro ao salvar treinamento.", 500, { requestId });
  }

  // 3. Incrementa contagem de itens na fonte
  await admin
    .from("ai_knowledge_sources")
    .update({
      chunks_count: currentChunks + 1,
      last_indexed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  // 4. Garante que a fonte de treinamento está vinculada às versões do agente
  const { data: versoes } = await admin
    .from("ai_agent_versions")
    .select("id, knowledge_source_ids")
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", input.agent_id);

  for (const versao of versoes ?? []) {
    const atuais: string[] = Array.isArray(versao.knowledge_source_ids) ? versao.knowledge_source_ids : [];
    if (!atuais.includes(sourceId)) {
      await admin
        .from("ai_agent_versions")
        .update({
          knowledge_source_ids: [...atuais, sourceId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", versao.id);
    }
  }

  return ok(
    {
      sucesso: true,
      source_id: sourceId,
      pergunta: input.question,
      resposta: input.answer,
      mensagem: "Resposta ensinada ao agente com sucesso! Ele usará esta instrução no atendimento.",
    },
    { requestId },
  );
}
