import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { CATEGORIA_LABEL, GRUPO_LABEL, type GrupoItem } from "@/lib/conciliacao/rotulos";
import { chavesEnviadas, lerFiltrosItens, listarItens, mapaFiliais, obterConciliacao, TAMANHO_PAGINA_ITENS } from "@/lib/data/conciliacao";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { BadgeCategoria, BadgeStatusPendencia, Filial } from "../badges-conc";

export const metadata = { title: "Conciliação" };

const pct = (v: number | string | null | undefined) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1).replace(".", ",")}%`);
type Contagem = { qtd: number; valor: number };
type Resumo = {
  bateu?: number;
  valorBateu?: number;
  conferir?: number;
  soTrier?: number;
  valorSoTrier?: number;
  semArquivo?: number;
  valorSemArquivo?: number;
  soDDA?: number;
  valorSoDDA?: number;
  descontos?: { noVencimento: Contagem; soAntecipado: Contagem; semData: Contagem };
  porCategoria?: Record<string, Contagem>;
  porFilial?: Record<string, number | string>[];
  taxas?: { fornecedor: string; taxas: number[] }[];
  arquivos?: { id: string; nome: string; tipo: string }[];
  avisos?: string[];
  pendencias?: { novas: number; reabertas: number; resolvidasAuto: number; abertasNaLeva: number };
  cobertura?: { ini: string | null; fim: string | null; bancoVencIni: string | null };
};

const ABAS: { chave: GrupoItem | "descontos" | "filiais"; rotulo: string }[] = [
  { chave: "exato", rotulo: "Bateram" },
  { chave: "aproximado", rotulo: "Para conferir" },
  { chave: "so_trier", rotulo: "Só no Trier" },
  { chave: "so_dda", rotulo: "Só no DDA" },
  { chave: "descontos", rotulo: "Descontos" },
  { chave: "filiais", rotulo: "Por filial" },
];

export default async function ConciliacaoDetalhePage({ params, searchParams }: PageProps<"/conciliacao/[id]">) {
  const [, { id }, sp] = await Promise.all([exigirAcesso("/conciliacao"), params, searchParams]);
  const c = await obterConciliacao(id);
  if (!c) notFound();
  const r = (c.resumo ?? {}) as Resumo;
  const abaPedida = typeof sp.aba === "string" ? sp.aba : "";
  const aba = abaPedida === "filiais" ? "filiais" : lerFiltrosItens(sp).grupo;
  const filtros = lerFiltrosItens(sp);
  const [filiais, resultado] = await Promise.all([mapaFiliais(), aba === "filiais" ? null : listarItens(c.id, filtros)]);
  const itens = resultado?.itens ?? [];
  const [enviados, pendencias] = await Promise.all([
    chavesEnviadas(itens.map((i) => i.chave)),
    (async () => {
      if (!itens.length) return new Map<string, { status: "pendente" | "em_analise" | "resolvido" | "justificado"; auto: boolean; motivo: string | null }>();
      const supabase = await createClient();
      const { data } = await supabase.from("conc_pendencias").select("chave, status, auto, motivo").in("chave", itens.map((i) => i.chave));
      return new Map((data ?? []).map((p) => [p.chave, p]));
    })(),
  ]);
  const base = `/conciliacao/${c.id}`;
  const paramsLista = { aba: filtros.grupo, q: filtros.q, filial: filtros.filial !== undefined ? String(filtros.filial) : undefined, categoria: filtros.categoria };
  const categoriasDaAba = Object.entries(r.porCategoria ?? {}).filter(([, v]) => v.qtd > 0);
  const kpis: [string, string, string | null, string?][] = [
    ["Bateram", pct(c.pct_bateu), `${r.bateu ?? 0} de ${c.qtd_trier} títulos · ${pct(c.pct_valor_bateu)} do valor`, "text-emerald-700"],
    ["Para conferir", String(r.conferir ?? 0), "valor, data, documento ou filial diferente", (r.conferir ?? 0) > 0 ? "text-amber-700" : undefined],
    ["Só no Trier", String(r.soTrier ?? 0), `${formatarMoeda(r.valorSoTrier ?? 0)}${r.semArquivo ? ` · +${r.semArquivo} fora do período dos arquivos` : ""}`, (r.soTrier ?? 0) > 0 ? "text-red-700" : undefined],
    ["Só no DDA", String(r.soDDA ?? 0), `${formatarMoeda(r.valorSoDDA ?? 0)} de boletos sem título`, (r.soDDA ?? 0) > 0 ? "text-sky-700" : undefined],
    ["Desconto no vencimento", formatarMoeda(r.descontos?.noVencimento.valor ?? 0), `${r.descontos?.noVencimento.qtd ?? 0} boleto(s) · antecipado ${formatarMoeda(r.descontos?.soAntecipado.valor ?? 0)}`],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo={c.titulo || `Conciliação de ${formatarDataHora(c.criado_em)}`}
        descricao={`Filiais ${c.fil_min}–${c.fil_max} · ${pluralizar(c.qtd_trier, "título do Trier", "títulos do Trier")} (${formatarMoeda(c.total_trier)}) × ${pluralizar(c.qtd_dda, "boleto", "boletos")} (${formatarMoeda(c.total_dda)}) · vencimentos ${formatarData(c.venc_ini)} a ${formatarData(c.venc_fim)} · por ${c.quem?.nome ?? "—"} em ${formatarDataHora(c.criado_em)}`}
        acoes={
          <Button variant="outline" nativeButton={false} render={<Link href="/conciliacao/pendencias" />}>
            Pendências
          </Button>
        }
      />

      {sp.nova === "1" && (
        <div className="mb-4">
          <AvisoSucesso
            mensagem={`Conciliação concluída.${r.pendencias ? ` Pendências: ${r.pendencias.novas} nova(s), ${r.pendencias.reabertas} reaberta(s), ${r.pendencias.resolvidasAuto} resolvida(s) automaticamente.` : ""}`}
          />
        </div>
      )}
      {(r.avisos ?? []).length > 0 && (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4" aria-hidden /> Avisos
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {r.avisos!.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map(([rotulo, valor, nota, tom]) => (
          <div key={rotulo} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${tom ?? ""}`}>{valor}</p>
            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
          </div>
        ))}
      </section>

      <p className="mb-4 text-xs text-muted-foreground">
        Arquivos: {(r.arquivos ?? []).map((a) => a.nome).join(" · ")}
        {r.taxas && r.taxas.length > 0 ? ` · Tarifas de boleto aprendidas: ${r.taxas.map((t) => `${t.fornecedor} (${t.taxas.map((x) => formatarMoeda(x)).join(", ")})`).join("; ")}` : ""}
      </p>

      <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => {
          const qtd = a.chave === "descontos" ? (r.descontos?.noVencimento.qtd ?? 0) + (r.descontos?.soAntecipado.qtd ?? 0) + (r.descontos?.semData.qtd ?? 0) : a.chave === "filiais" ? (r.porFilial?.length ?? 0) : a.chave === "exato" ? (r.bateu ?? 0) : a.chave === "aproximado" ? (r.conferir ?? 0) : a.chave === "so_trier" ? (r.soTrier ?? 0) + (r.semArquivo ?? 0) : (r.soDDA ?? 0);
          const ativa = aba === a.chave;
          return (
            <Link key={a.chave} href={`${base}?aba=${a.chave}`} aria-current={ativa ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${ativa ? "border-fct-navy bg-fct-navy text-white" : "bg-card hover:border-fct-navy/40"}`}>
              {a.rotulo} <span className={ativa ? "opacity-80" : "text-muted-foreground"}>({qtd})</span>
            </Link>
          );
        })}
      </nav>

      {aba === "filiais" ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Títulos</TableHead>
                <TableHead className="text-right">Boletos</TableHead>
                <TableHead className="text-right">Bateram</TableHead>
                <TableHead className="text-right">Conferir</TableHead>
                <TableHead className="text-right">Só Trier</TableHead>
                <TableHead className="text-right">Só DDA</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Valor só Trier</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Valor só DDA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(r.porFilial ?? []).map((f) => {
                const fil = f.filial === "—" ? null : Number(f.filial);
                return (
                  <TableRow key={String(f.filial)}>
                    <TableCell>
                      <Link href={`${base}?aba=aproximado${fil != null ? `&filial=${fil}` : ""}`} className="hover:underline">
                        <Filial filial={fil} nome={fil != null ? filiais.porFilial.get(fil)?.nome : null} />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.titulos}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.boletos}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{f.exatos}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{f.conferir}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-700">{f.soTrier}</TableCell>
                    <TableCell className="text-right tabular-nums text-sky-700">{f.soDDA}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(Number(f.valorSoTrier))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(Number(f.valorSoDDA))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <>
          <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-center">
            <input type="hidden" name="aba" value={filtros.grupo} />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Beneficiário, fornecedor, documento ou CNPJ" className="pl-8" aria-label="Buscar" />
            </div>
            <Input name="filial" type="number" min={1} max={9999} defaultValue={filtros.filial ?? ""} placeholder="Filial" aria-label="Filial" className="lg:w-32" />
            <SelectNativo name="categoria" defaultValue={filtros.categoria ?? ""} aria-label="Situação" className="lg:w-72">
              <option value="">Todas as situações</option>
              {categoriasDaAba.map(([k, v]) => (
                <option key={k} value={k}>
                  {CATEGORIA_LABEL[k] ?? k} ({v.qtd})
                </option>
              ))}
              {filtros.grupo === "so_dda" && <option value="SO_DDA">Só no DDA</option>}
            </SelectNativo>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
            {filtros.q || filtros.filial !== undefined || filtros.categoria ? (
              <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`${base}?aba=${filtros.grupo}`} />}>
                Limpar
              </Button>
            ) : (
              <span />
            )}
          </form>

          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Filial</TableHead>
                  <TableHead className="w-28">Vencimento</TableHead>
                  <TableHead>Beneficiário / fornecedor</TableHead>
                  <TableHead className="hidden lg:table-cell">Documentos</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="hidden md:table-cell">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Nada em “{GRUPO_LABEL[filtros.grupo as GrupoItem] ?? "Descontos"}” com esses filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  itens.map((it) => {
                    const pd = pendencias.get(it.chave);
                    const env = enviados.get(it.chave);
                    const desc = it.desconto as { valor: number; ate: string | null; noVencimento: boolean | null } | null;
                    const dados = it.dados as { filTrier?: number | null } | null;
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <Filial filial={it.filial} />
                          {dados?.filTrier != null && it.filial != null && dados.filTrier !== it.filial && <p className="text-xs text-amber-700">Trier na {dados.filTrier}</p>}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatarData(it.vencimento)}</TableCell>
                        <TableCell>
                          <p className="font-medium">{it.beneficiario ?? it.fornecedor}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.beneficiario && it.fornecedor && it.beneficiario !== it.fornecedor ? `Trier: ${it.fornecedor}` : ""}
                            {it.cnpj ? `${it.beneficiario && it.fornecedor && it.beneficiario !== it.fornecedor ? " · " : ""}${it.cnpj}` : ""}
                            {it.fornecedor_real ? ` · fornecedor real: ${it.fornecedor_real}` : ""}
                          </p>
                          {it.alerta && <p className="text-xs font-semibold text-red-700">ALERTA: {it.alerta}</p>}
                          {desc && (
                            <p className="text-xs text-emerald-700">
                              Desconto {formatarMoeda(desc.valor)} {desc.noVencimento === true ? `pagando até ${formatarData(desc.ate)}` : desc.noVencimento === false ? "(só antecipado)" : "(conferir data)"}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-xs text-xs text-muted-foreground lg:table-cell">
                          {it.documento && <p className="truncate" title={it.documento}>Trier: {it.documento}</p>}
                          {it.numdoc && <p className="truncate">Boleto: {it.numdoc}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(it.valor)}
                          {it.diferenca != null && Number(it.diferenca) !== 0 && (
                            <p className={`text-xs ${Number(it.diferenca) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                              {Number(it.diferenca) > 0 ? "+" : ""}
                              {formatarMoeda(it.diferenca)} vs Trier
                            </p>
                          )}
                          {it.taxa != null && Number(it.taxa) > 0 && <p className="text-xs text-muted-foreground">tarifa {formatarMoeda(it.taxa)}</p>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col items-start gap-1">
                            <BadgeCategoria categoria={it.categoria} />
                            {pd && (pd.status !== "pendente" || pd.auto) && <BadgeStatusPendencia status={pd.status} auto={pd.auto} />}
                            {env && <span className="text-xs text-emerald-700">✔ enviado ao Omie em {formatarData(env.enviado_em)}</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {resultado && (
              <div className="border-t px-4 py-3">
                <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} tamanho={TAMANHO_PAGINA_ITENS} params={paramsLista} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
