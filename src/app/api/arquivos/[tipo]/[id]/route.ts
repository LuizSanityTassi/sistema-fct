import { NextResponse } from "next/server";
import { obterArquivo } from "@/lib/data/documentos";
import { BUCKET_DOCUMENTOS } from "@/lib/rh/arquivos";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Download de documento/laudo: gera URL assinada de 60 s. O RLS (tabela + Storage) decide quem pode.
export async function GET(req: Request, ctx: RouteContext<"/api/arquivos/[tipo]/[id]">) {
  const { tipo, id } = await ctx.params;
  if (tipo !== "documento" && tipo !== "aso" && tipo !== "holerite" && tipo !== "anexo" && tipo !== "caixa" && tipo !== "sangria") {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const supabase = await createClient();
  // getSessao: sem login vai para /login; usuário desativado tem a sessão encerrada (não basta ter um token válido)
  await getSessao();

  const arquivo = await obterArquivo(tipo, id, { original: new URL(req.url).searchParams.get("original") === "1" });
  if (!arquivo) return new NextResponse("Arquivo não encontrado ou sem permissão.", { status: 404 });

  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(arquivo.storage_path, 60, { download: arquivo.nome });
  if (error || !data) return new NextResponse("Não foi possível gerar o link.", { status: 403 });

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
