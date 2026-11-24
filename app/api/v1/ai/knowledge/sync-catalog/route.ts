import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const syncCatalogSchema = z.object({
  agent_id: z.string().uuid().optional(),
  version_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  let body: z.infer<typeof syncCatalogSchema> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    body = syncCatalogSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return fail("validation_error", "Parâmetros inválidos.", 400, {
        requestId,
        details: err.flatten(),
      });
    }
  }

  const admin = createAdminClient();

  // 1. Busca todos os produtos ativos do catálogo desta organização
  const { data: produtos, error: prodErr } = await admin
    .from("catalog_products")
    .select("id, codigo, nome, descricao, marca, categoria, preco_cents, moeda, controla_estoque, quantidade, ativo, fotos")
    .eq("organization_id", activeOrg.orgId)
    .eq("ativo", true)
    .order("nome");

  if (prodErr) {
    console.error("[sync-catalog] Falha ao ler produtos:", prodErr.message);
    return fail("internal_error", "Erro ao ler produtos do catálogo.", 500, { requestId });
  }

  const listaProdutos = produtos ?? [];
  if (listaProdutos.length === 0) {
    return fail("empty_catalog", "Nenhum produto ativo encontrado no catálogo para sincronizar.", 400, { requestId });
  }

  const sourceName = "Catálogo de Produtos e Serviços";

  // 2. Localiza ou cria a fonte de conhecimento do catálogo
  const { data: fontesExistentes } = await admin
    .from("ai_knowledge_sources")
    .select("id, name")
    .eq("organization_id", activeOrg.orgId)
    .eq("name", sourceName)
    .eq("is_active", true)
    .limit(1);

  let sourceId: string;

  if (fontesExistentes && fontesExistentes.length > 0 && fontesExistentes[0]) {
    sourceId = fontesExistentes[0].id;
    // Remove itens anteriores do catálogo para atualizar com os dados mais recentes
    await admin
      .from("ai_faq_items")
      .delete()
      .eq("organization_id", activeOrg.orgId)
      .eq("knowledge_source_id", sourceId);
  } else {
    const { data: novaFonte, error: novaFonteErr } = await admin
      .from("ai_knowledge_sources")
      .insert({
        organization_id: activeOrg.orgId,
        agent_id: body.agent_id ?? null,
        source_type: "faq",
        name: sourceName,
        status: "ready",
        is_active: true,
        source_metadata: { origem: "catalogo_sync", sincronizado_em: new Date().toISOString() },
        ingested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (novaFonteErr || !novaFonte) {
      console.error("[sync-catalog] Falha ao criar fonte de conhecimento:", novaFonteErr?.message);
      return fail("internal_error", "Erro ao criar material do catálogo.", 500, { requestId });
    }
    sourceId = novaFonte.id;
  }

  // 3. Constrói as perguntas e respostas estruturadas para o agente
  const faqRows = listaProdutos.map((p, idx) => {
    const precoFormatado = formatCents(p.preco_cents, p.moeda ?? "BRL");
    const detalhesEstoque = p.controla_estoque
      ? `Estoque atual: ${p.quantidade} unidade(s).`
      : "Item sob encomenda / produção personalizada.";
    const totalFotos = (p.fotos ?? []).length;
    const infoFotos = totalFotos > 0
      ? `Possui ${totalFotos} foto(s) no catálogo pronta(s) para envio ao cliente pelo WhatsApp.`
      : "Sem foto cadastrada.";

    const pergunta = `Quais as informações, preço e detalhes de ${p.nome}? (Código: ${p.codigo})`;
    const resposta = [
      `Produto/Serviço: ${p.nome}`,
      `Código: ${p.codigo}`,
      p.categoria ? `Categoria: ${p.categoria}` : null,
      p.marca ? `Marca/Linha: ${p.marca}` : null,
      `Preço: ${precoFormatado}`,
      detalhesEstoque,
      infoFotos,
      p.descricao ? `Descrição detalhada: ${p.descricao}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      organization_id: activeOrg.orgId,
      knowledge_source_id: sourceId,
      question: pergunta,
      answer: resposta,
      tags: [p.codigo, p.categoria, p.marca].filter((t): t is string => typeof t === "string" && t.trim() !== ""),
      locale: "pt-BR",
      position: idx,
    };
  });

  const { error: insertErr } = await admin.from("ai_faq_items").insert(faqRows);
  if (insertErr) {
    console.error("[sync-catalog] Falha ao inserir faq items:", insertErr.message);
    return fail("internal_error", "Erro ao registrar perguntas do catálogo.", 500, { requestId });
  }

  // Atualiza chunks_count na fonte
  await admin
    .from("ai_knowledge_sources")
    .update({
      chunks_count: faqRows.length,
      last_indexed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  // 4. Se um agent_id ou version_id foi especificado, vincula a fonte de conhecimento à versão do agente
  if (body.agent_id) {
    const { data: versoes } = await admin
      .from("ai_agent_versions")
      .select("id, knowledge_source_ids")
      .eq("organization_id", activeOrg.orgId)
      .eq("agent_id", body.agent_id);

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
  }

  return ok(
    {
      sucesso: true,
      source_id: sourceId,
      source_name: sourceName,
      total_sincronizados: faqRows.length,
      mensagem: `${faqRows.length} produto(s) do catálogo foram sincronizados no conhecimento do agente com sucesso!`,
    },
    { requestId },
  );
}
