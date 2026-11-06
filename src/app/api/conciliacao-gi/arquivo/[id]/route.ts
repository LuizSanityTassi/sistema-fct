import { NextResponse } from "next/server";
import { BUCKET_CONCILIACAO } from "@/lib/conciliacao-gi/servico";
import { obterArquivo } from "@/lib/data/conciliacao-gi";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Download de um arquivo da Conciliação GI (tabela gi_conc_arquivos): URL assinada de 60 s. O RLS (tabela + Storage) decide quem pode.
export async function GET(_req: Request, ctx: RouteContext<"/api/conciliacao-gi/arquivo/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // getSessao: sem login vai para /login; usuário desativado tem a sessão encerrada (não basta ter um token válido)
  await getSessao();

  const arquivo = await obterArquivo(id);
  if (!arquivo) return new NextResponse("Arquivo não encontrado ou sem permissão.", { status: 404 });

  const { data, error } = await supabase.storage.from(BUCKET_CONCILIACAO).createSignedUrl(arquivo.storage_path, 60, { download: arquivo.nome });
  if (error || !data) return new NextResponse("Não foi possível gerar o link.", { status: 403 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
