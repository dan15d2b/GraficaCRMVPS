import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarProvaDigital } from "@/lib/provas/servico";

export const dynamic = "force-dynamic";

const CriarProvaSchema = z.object({
  conversation_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  os_number: z.string().max(50).optional(),
  titulo: z.string().trim().min(1).max(200),
  file_url: z.string().min(1),
  file_name: z.string().trim().min(1).max(255),
  file_mime: z.string().max(100).optional(),
  file_size_bytes: z.number().int().nonnegative().optional(),
  enviar_whatsapp: z.boolean().default(true),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "arte_provas" });
  if (!authz.ok) return authz.response;

  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  const contactId = req.nextUrl.searchParams.get("contact_id");
  const status = req.nextUrl.searchParams.get("status");

  const admin = createAdminClient();
  let query = admin
    .from("arte_provas")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (conversationId) query = query.eq("conversation_id", conversationId);
  if (contactId) query = query.eq("contact_id", contactId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return fail("internal_error", "Falha ao consultar provas digitais.", 500, { requestId });
  }

  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "arte_provas" });
  if (!authz.ok) return authz.response;

  const body = await req.json().catch(() => null);
  const parsed = CriarProvaSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos para criação da prova.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const {
    conversation_id,
    contact_id,
    lead_id,
    os_number,
    titulo,
    file_url,
    file_name,
    file_mime,
    file_size_bytes,
    enviar_whatsapp,
  } = parsed.data;

  // Obter baseUrl a partir dos headers da requisição
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  try {
    const admin = createAdminClient();
    const prova = await criarProvaDigital(admin, {
      organizationId: authz.org.orgId,
      conversationId: conversation_id,
      contactId: contact_id,
      leadId: lead_id,
      osNumber: os_number,
      titulo,
      fileUrl: file_url,
      fileName: file_name,
      fileMime: file_mime,
      fileSizeBytes: file_size_bytes,
      enviarWhatsapp: enviar_whatsapp,
      userId: authz.user.id,
      baseUrl,
    });

    return ok(prova, { requestId, status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno ao criar prova.";
    return fail("internal_error", msg, 500, { requestId });
  }
}
