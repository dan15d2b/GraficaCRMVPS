import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const { token } = await ctx.params;

  if (!token) {
    return new Response("Token não informado", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: prova, error } = await admin
    .from("arte_provas")
    .select("file_url, file_name, file_mime")
    .eq("token", token)
    .maybeSingle();

  if (error || !prova || !prova.file_url) {
    return new Response("Arquivo não encontrado ou link expirado", { status: 404 });
  }

  // Se for URL externa completa (http/https), redireciona
  if (prova.file_url.startsWith("http://") || prova.file_url.startsWith("https://")) {
    return NextResponse.redirect(prova.file_url);
  }

  // Caso seja storage_path no bucket whatsapp-media
  const storagePath = prova.file_url;
  const { data: signed, error: signErr } = await admin.storage
    .from("whatsapp-media")
    .createSignedUrl(storagePath, 86400); // 24h

  if (signErr || !signed?.signedUrl) {
    return new Response("Erro ao gerar acesso ao arquivo", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
