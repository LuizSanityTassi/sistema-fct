import type { Metadata } from "next";
import Link from "next/link";
import { getSessao, semAcesso } from "@/lib/auth/session";
import { linkDoAtivo, origemDoSistema, svgQr } from "@/lib/ti/qr";
import { TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";
import { createClient } from "@/lib/supabase/server";
import { BotaoImprimir } from "./imprimir";

export const metadata: Metadata = { title: "Etiquetas de patrimônio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 62 × 30 mm com 3 mm entre elas numa A4 com margem de 8 mm: 3 por linha, 8 linhas. */
const POR_FOLHA = 24;
const MAX_COPIAS = 20;

const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number.parseInt(typeof v === "string" ? v : "", 10);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/**
 * Etiquetas de patrimônio com QR Code (62 × 30 mm, 24 por folha A4). Fora do layout do sistema para imprimir limpo.
 * ?ids=a,b,c ou ?id=a&id=b (equipamentos escolhidos) ou ?filial=<id> (todos os ativos da loja que não foram baixados).
 * ?copias=N repete cada etiqueta; ?inicio=N começa na N-ª posição da folha (folha de adesivo já usada em parte).
 */
export default async function EtiquetasTiPage({ searchParams }: PageProps<"/etiquetas/ti">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  if (sessao.papel !== "admin" && sessao.papel !== "ti") semAcesso("/etiquetas/ti");
  const ids = [...new Set([...(typeof sp.ids === "string" ? sp.ids.split(",") : []), ...[sp.id].flat().filter((x): x is string => typeof x === "string")])]
    .map((x) => x.trim())
    .filter((x) => UUID.test(x))
    .slice(0, 300);
  const filial = typeof sp.filial === "string" && UUID.test(sp.filial) ? sp.filial : null;
  const copias = inteiro(sp.copias, 1, MAX_COPIAS, 1);
  const inicio = inteiro(sp.inicio, 1, POR_FOLHA, 1);
  const supabase = await createClient();
  let consulta = supabase.from("it_assets").select("id, tipo, descricao, patrimonio, setor, unidade:branches(codigo, nome)").eq("ativo", true).neq("status", "baixado").order("patrimonio");
  if (ids.length) consulta = consulta.in("id", ids);
  else if (filial) consulta = consulta.eq("branch_id", filial);
  else consulta = consulta.limit(0);
  const { data: ativos } = await consulta;
  const origem = await origemDoSistema();
  const etiquetas = await Promise.all((ativos ?? []).map(async (a) => ({ ...a, qr: await svgQr(linkDoAtivo(origem, a.id)) })));
  // cada equipamento repetido N vezes, depois das posições já usadas da primeira folha
  const lista = etiquetas.flatMap((a) => Array.from({ length: copias }, (_, i) => ({ ...a, chave: `${a.id}-${i}` })));
  const total = lista.length;
  const folhas = total ? Math.ceil((total + inicio - 1) / POR_FOLHA) : 0;

  return (
    <main className="mx-auto w-full max-w-[210mm] p-6 print:p-0">
      <style>{`@page { size: A4; margin: 8mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } }`}</style>
      <div className="nao-imprimir mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Etiquetas de patrimônio</h1>
            <p className="text-sm text-muted-foreground">
              {etiquetas.length} equipamento(s) · {total} etiqueta(s) de 62 × 30 mm · {POR_FOLHA} por folha A4 ({folhas} folha{folhas === 1 ? "" : "s"}). Use papel adesivo ou etiqueta térmica; escaneou, abre a ficha do
              equipamento.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/ti/ativos" className="inline-flex items-center rounded-lg border px-3 text-sm">
              Voltar ao inventário
            </Link>
            <BotaoImprimir />
          </div>
        </div>
        {etiquetas.length > 0 && (
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            {ids.length ? <input type="hidden" name="ids" value={ids.join(",")} /> : filial ? <input type="hidden" name="filial" value={filial} /> : null}
            <label className="grid gap-1">
              <span className="font-medium">Cópias de cada</span>
              <input name="copias" type="number" min={1} max={MAX_COPIAS} defaultValue={copias} className="h-9 w-24 rounded-md border bg-background px-2" />
            </label>
            <label className="grid gap-1">
              <span className="font-medium">Começar na posição</span>
              <input name="inicio" type="number" min={1} max={POR_FOLHA} defaultValue={inicio} className="h-9 w-24 rounded-md border bg-background px-2" />
            </label>
            <button type="submit" className="h-9 rounded-md border bg-background px-3 font-medium">
              Atualizar
            </button>
            <p className="basis-full text-xs text-muted-foreground">
              Posição 1 = primeira etiqueta da folha (da esquerda para a direita, de cima para baixo). Folha de adesivo já usada em parte: comece na primeira livre.
            </p>
          </form>
        )}
      </div>

      {etiquetas.length === 0 ? (
        <p className="nao-imprimir text-sm text-muted-foreground">
          Nenhum equipamento para imprimir. Abra a partir de um equipamento, marque vários no inventário ou filtre uma loja.
        </p>
      ) : (
        <div className="flex flex-wrap gap-[3mm]">
          {Array.from({ length: inicio - 1 }, (_, i) => (
            <div key={`vazia-${i}`} aria-hidden className="h-[30mm] w-[62mm] rounded-[1.5mm] border border-dashed border-neutral-300 print:border-transparent" />
          ))}
          {lista.map((a) => {
            const loja = a.unidade as { codigo: string; nome: string } | null;
            return (
              <div key={a.chave} className="flex h-[30mm] w-[62mm] items-center gap-[2.5mm] overflow-hidden rounded-[1.5mm] border border-neutral-400 bg-white p-[2mm] text-black [break-inside:avoid]">
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
