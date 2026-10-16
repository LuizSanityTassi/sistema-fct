import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { linkDoAtivo, origemDoSistema, svgQr } from "@/lib/ti/qr";
import { TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";
import { createClient } from "@/lib/supabase/server";
import { BotaoImprimir } from "./imprimir";

export const metadata: Metadata = { title: "Etiquetas de patrimônio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Etiquetas de patrimônio com QR Code (62 × 30 mm, várias por folha A4). Fora do layout do sistema para imprimir
 * limpo. ?ids=a,b,c (equipamentos escolhidos) ou ?filial=<id> (todos os ativos da loja que não foram baixados).
 */
export default async function EtiquetasTiPage({ searchParams }: PageProps<"/etiquetas/ti">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  if (sessao.papel !== "admin" && sessao.papel !== "ti") redirect("/dashboard?erro=sem_permissao");
  const ids = (typeof sp.ids === "string" ? sp.ids.split(",") : []).filter((x) => UUID.test(x)).slice(0, 300);
  const filial = typeof sp.filial === "string" && UUID.test(sp.filial) ? sp.filial : null;
  const supabase = await createClient();
  let consulta = supabase.from("it_assets").select("id, tipo, descricao, patrimonio, setor, unidade:branches(codigo, nome)").eq("ativo", true).neq("status", "baixado").order("patrimonio");
  if (ids.length) consulta = consulta.in("id", ids);
  else if (filial) consulta = consulta.eq("branch_id", filial);
  else consulta = consulta.limit(0);
  const { data: ativos } = await consulta;
  const origem = await origemDoSistema();
  const etiquetas = await Promise.all((ativos ?? []).map(async (a) => ({ ...a, qr: await svgQr(linkDoAtivo(origem, a.id)) })));

  return (
    <main className="mx-auto w-full max-w-[210mm] p-6 print:p-0">
      <style>{`@page { size: A4; margin: 8mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } }`}</style>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Etiquetas de patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {etiquetas.length} etiqueta(s) de 62 × 30 mm. Use papel adesivo ou etiqueta térmica; escaneou, abre a ficha do equipamento.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ti/ativos" className="inline-flex items-center rounded-lg border px-3 text-sm">
            Voltar ao inventário
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      {etiquetas.length === 0 ? (
        <p className="nao-imprimir text-sm text-muted-foreground">Nenhum equipamento para imprimir. Abra a partir de um equipamento ou do inventário filtrado por loja.</p>
      ) : (
        <div className="flex flex-wrap gap-[3mm]">
          {etiquetas.map((a) => {
            const loja = a.unidade as { codigo: string; nome: string } | null;
            return (
              <div key={a.id} className="flex h-[30mm] w-[62mm] items-center gap-[2.5mm] overflow-hidden rounded-[1.5mm] border border-neutral-400 bg-white p-[2mm] text-black [break-inside:avoid]">
                <div className="size-[25mm] shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: a.qr }} />
                <div className="min-w-0 leading-tight">
                  <p className="text-[6.5pt] font-semibold tracking-wide text-neutral-600 uppercase">Farmácias FCT · TI</p>
                  <p className="mt-[0.8mm] font-mono text-[9pt] font-bold break-all">{a.patrimonio ?? "sem patrimônio"}</p>
                  <p className="mt-[0.8mm] truncate text-[7pt]">{TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo}</p>
                  <p className="truncate text-[6.5pt] text-neutral-600">
                    {loja ? `${loja.codigo} · ${loja.nome}` : ""}
                    {a.setor ? ` · ${a.setor}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
