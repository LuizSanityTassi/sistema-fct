import { NextResponse } from "next/server";
import { BUCKET_CONCILIACAO } from "@/lib/conciliacao-gi/servico";
import { obterArquivo } from "@/lib/data/conciliacao-gi";
import { createClient } from "@/lib/supabase/server";

// Download de um arquivo da Conciliação GI (tabela gi_conc_arquivos): URL assinada de 60 s. O RLS (tabela + Storage) decide quem pode.
export async function GET(req: Request, ctx: RouteContext<"/api/conciliacao-gi/arquivo/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const arquivo = await obterArquivo(id);
  if (!arquivo) return new NextResponse("Arquivo não encontrado ou sem permissão.", { status: 404 });

  const { data, error } = await supabase.storage.from(BUCKET_CONCILIACAO).createSignedUrl(arquivo.storage_path, 60, { download: arquivo.nome });
  if (error || !data) return new NextResponse("Não foi possível gerar o link.", { status: 403 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
