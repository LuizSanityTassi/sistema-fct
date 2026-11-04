import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Search, TriangleAlert, Workflow } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Ponto } from "@/components/layout/status";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import type { ConfigOmie } from "@/lib/conciliacao/omie";
import { statusChaves, type CacheOmie, type EmpresaOmie } from "@/lib/conciliacao/omie-api";
import { CONFIG_OMIE_PADRAO, contasDaConciliacao } from "@/lib/conciliacao/omie-envio";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { CATEGORIA_LABEL, GRUPO_LABEL, type GrupoItem } from "@/lib/conciliacao/rotulos";
import { anomaliaGrave, type ResumoAnomalia } from "@/lib/conciliacao/servico";
import { chavesDoFiltro, chavesEnviadas, lerFiltrosItens, listarItens, mapaFiliais, obterConciliacao, obterConfig, TAMANHO_PAGINA_ITENS } from "@/lib/data/conciliacao";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { BadgeCategoria, BadgeStatusPendencia, Filial } from "../badges-conc";
import { enviarPlanilhaOmie, validarEnvioOmie } from "../omie-actions";
import { EnvioOmie } from "./envio-omie";
import { BarraMarcarOmie, FORM_MARCAR_OMIE } from "./marcar-omie";

export const metadata = { title: "Conciliação" };
// a aba do Omie lê todas as contas e o envio em lote leva minutos
export const maxDuration = 300;

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
  pendencias?: { novas: number; reabertas: number; resolvidasAuto: number; abertasNaLeva: number; porRegra?: number };
  cobertura?: { ini: string | null; fim: string | null; bancoVencIni: string | null };
  anomalias?: number;
  anomaliasGraves?: number;
  anomaliasLista?: ResumoAnomalia[];
};
const raizDe = (cnpj: string) => cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 8);

const ABAS: { chave: GrupoItem | "descontos" | "filiais" | "omie"; rotulo: string }[] = [
  { chave: "exato", rotulo: "Bateram" },
  { chave: "aproximado", rotulo: "Para conferir" },
  { chave: "so_trier", rotulo: "Só no Trier" },
  { chave: "so_dda", rotulo: "Só no DDA" },
  { chave: "descontos", rotulo: "Descontos" },
  { chave: "filiais", rotulo: "Por filial" },
  { chave: "omie", rotulo: "Enviar ao Omie" },
];

export default async function ConciliacaoDetalhePage({ params, searchParams }: PageProps<"/conciliacao/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/conciliacao"), params, searchParams]);
  const c = await obterConciliacao(id);
  if (!c) notFound();
  const r = (c.resumo ?? {}) as Resumo;
  const abaPedida = typeof sp.aba === "string" ? sp.aba : "";
  const aba = abaPedida === "filiais" || abaPedida === "omie" ? abaPedida : lerFiltrosItens(sp).grupo;
  const filtros = lerFiltrosItens(sp);
  const [filiais, resultado] = await Promise.all([mapaFiliais(), aba === "filiais" || aba === "omie" ? null : listarItens(c.id, filtros)]);
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
  // marcados na lista (Só no DDA etc.) chegam aqui pela barra "Enviar marcados ao Omie"
  // "marcar todos desta lista" chega pelos filtros: não cabem milhares de contas no endereço
  const grupoOmie = typeof sp.grupo === "string" ? sp.grupo : undefined;
  const marcadas =
    aba === "omie" && sp.todos === "1"
      ? await chavesDoFiltro(c.id, lerFiltrosItens({ ...sp, aba: grupoOmie }))
      : [sp.marcar].flat().filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 80);
  const marcavel = podeConciliar(sessao.papel) && ["exato", "aproximado", "so_trier", "so_dda"].includes(filtros.grupo);
  const omie =
    aba === "omie"
      ? await (async () => {
          const supabase = await createClient();
          const [contas, config, { data: cfgs }] = await Promise.all([
            contasDaConciliacao(supabase, c.id),
            obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO),
            supabase.from("conc_config").select("chave, valor").in("chave", ["omie_cache_nazario", "omie_cache_varela", "omie_nazario", "omie_varela"]),
          ]);
          const cfg = new Map((cfgs ?? []).map((x) => [x.chave, x.valor]));
          const ch = await statusChaves(supabase);
          const status = (e: EmpresaOmie) => {
            const cache = cfg.get(`omie_cache_${e}`) as CacheOmie | undefined;
            return {
              nome: e === "nazario" ? "Nazário" : "Varela",
              configurado: ch[e].configurado,
              pronto: ch[e].configurado && !!cache?.conta && !!cache?.categoria,
              testado: !!(cfg.get(`omie_${e}`) as { testado?: boolean } | undefined)?.testado,
            };
          };
          return { contas, config, api: { nazario: status("nazario"), varela: status("varela") } };
        })()
      : null;
  const paramsLista = { aba: filtros.grupo, q: filtros.q, filial: filtros.filial !== undefined ? String(filtros.filial) : undefined, categoria: filtros.categoria, anomalias: filtros.anomalias ? "1" : undefined, venc_de: filtros.vencDe, venc_ate: filtros.vencAte };
  // as datas valem em todas as abas: dá para olhar o mesmo período em Exatos, Só no Trier e Só no DDA
  const sufixoDatas = `${filtros.vencDe ? `&venc_de=${filtros.vencDe}` : ""}${filtros.vencAte ? `&venc_ate=${filtros.vencAte}` : ""}`;
  const categoriasDaAba = Object.entries(r.porCategoria ?? {}).filter(([, v]) => v.qtd > 0);
  const kpis: [string, string, string | null, string?][] = [
    ["Bateram", pct(c.pct_bateu), `${r.bateu ?? 0} de ${c.qtd_trier} títulos · ${pct(c.pct_valor_bateu)} do valor`, "text-emerald-700"],
    ["Para conferir", String(r.conferir ?? 0), "valor, data, documento ou filial diferente", (r.conferir ?? 0) > 0 ? "text-amber-700" : undefined],
    ["Só no Trier", String(r.soTrier ?? 0), `${formatarMoeda(r.valorSoTrier ?? 0)}${r.semArquivo ? ` · +${r.semArquivo} fora do período dos arquivos` : ""}`, (r.soTrier ?? 0) > 0 ? "text-red-700" : undefined],
    ["Só no DDA", String(r.soDDA ?? 0), `${formatarMoeda(r.valorSoDDA ?? 0)} de boletos sem título`, (r.soDDA ?? 0) > 0 ? "text-sky-700" : undefined],
    ["Desconto no vencimento", formatarMoeda(r.descontos?.noVencimento.valor ?? 0), `${r.descontos?.noVencimento.qtd ?? 0} boleto(s) · antecipado ${formatarMoeda(r.descontos?.soAntecipado.valor ?? 0)}`],
    ["Fora do padrão", r.anomalias === undefined ? "—" : String(r.anomalias), r.anomalias === undefined ? "conciliação anterior à detecção" : (r.anomaliasGraves ?? 0) > 0 ? `${r.anomaliasGraves} grave(s) · comparado ao histórico do fornecedor` : "comparado ao histórico do fornecedor", (r.anomalias ?? 0) > 0 ? "text-orange-700" : undefined],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo={c.titulo || `Conciliação de ${formatarDataHora(c.criado_em)}`}
        descricao={`Filiais ${c.fil_min}–${c.fil_max} · ${pluralizar(c.qtd_trier, "título do Trier", "títulos do Trier")} (${formatarMoeda(c.total_trier)}) × ${pluralizar(c.qtd_dda, "boleto", "boletos")} (${formatarMoeda(c.total_dda)}) · vencimentos ${formatarData(c.venc_ini)} a ${formatarData(c.venc_fim)} · por ${c.quem?.nome ?? "robô"} em ${formatarDataHora(c.criado_em)}`}
        acoes={
          <Button variant="outline" nativeButton={false} render={<Link href="/conciliacao/pendencias" />}>
            Pendências
          </Button>
        }
      />

      {typeof sp.planilha === "string" && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>Planilha do Omie gerada com {sp.qtd ?? "?"} conta(s) e registrada como enviada.{Number(sp.fora) > 0 ? ` ${sp.fora} ficaram de fora porque já estão no Omie, já foram enviadas ou podem ser duplicidade.` : ""}</span>
          <a href={`/api/conciliacao/arquivo/${sp.planilha}`} className="font-medium underline">
            Baixar planilha
          </a>
          <span className="text-xs">Importe na Omie em Finanças → Contas a pagar → Importar planilha.</span>
        </div>
      )}
      {sp.nova === "1" && (
        <div className="mb-4">
          <AvisoSucesso
            mensagem={`Conciliação concluída.${r.pendencias ? ` Pendências: ${r.pendencias.novas} nova(s), ${r.pendencias.reabertas} reaberta(s), ${r.pendencias.resolvidasAuto} resolvida(s) automaticamente${r.pendencias.porRegra ? `, ${r.pendencias.porRegra} tratada(s) por regra` : ""}.` : ""}`}
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

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map(([rotulo, valor, nota, tom]) => (
          <div key={rotulo} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{rotulo}</p>
            <p className={`mt-1 numero-sm ${tom ?? ""}`}>{valor}</p>
            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
          </div>
        ))}
      </section>

      <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <Workflow className="size-3.5" aria-hidden />
        <span>
          Motor: {pluralizar(r.bateu ?? 0, "título conciliado", "títulos conciliados")} automaticamente · {r.conferir ?? 0} sugerido(s) para conferir · {(r.soTrier ?? 0) + (r.soDDA ?? 0)} para análise
          {r.pendencias?.porRegra !== undefined ? ` · ${pluralizar(r.pendencias.porRegra, "pendência tratada", "pendências tratadas")} por regra` : ""} ·
        </span>
        <Link href="/conciliacao/regras" className="text-fct-tinta underline">
          Regras automáticas
        </Link>
      </p>

      {(r.anomaliasLista ?? []).length > 0 && (
        <details id="anomalias" className="mb-4 rounded-xl border border-orange-200 bg-orange-50/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-orange-900">
            <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Fora do padrão: {pluralizar(r.anomalias ?? 0, "boleto", "boletos")} comparando com o histórico de cada fornecedor
            {(r.anomalias ?? 0) > (r.anomaliasLista?.length ?? 0) ? ` (mostrando os ${r.anomaliasLista!.length} maiores)` : ""}
          </summary>
          <ul className="divide-y border-t text-sm">
            {r.anomaliasLista!.map((a) => (
              <li key={a.chave} className="flex flex-wrap items-start gap-x-3 px-4 py-2">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{formatarData(a.vencimento)}</span>
                <Filial filial={a.filial} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{a.beneficiario ?? "—"}</span> · {formatarMoeda(a.valor)}
                  <ul className="mt-0.5 text-xs">
                    {a.avisos.map((v) => (
                      <li key={v} className={anomaliaGrave(v) ? "font-semibold text-red-700" : "text-orange-800"}>
                        <Ponto tom={anomaliaGrave(v) ? "perigo" : "alerta"} className="mr-1.5" />
                        {v}
                      </li>
                    ))}
                  </ul>
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-xs text-orange-900">Anomalias graves (valor EXTREMAMENTE acima, banco diferente) bloqueiam o envio ao Omie; as outras só avisam. A ficha de cada fornecedor está em Conciliação → Fornecedores.</p>
        </details>
      )}

      <p className="mb-4 text-xs text-muted-foreground">
        Arquivos: {(r.arquivos ?? []).map((a) => a.nome).join(" · ")}
        {r.taxas && r.taxas.length > 0 ? ` · Tarifas de boleto aprendidas: ${r.taxas.map((t) => `${t.fornecedor} (${t.taxas.map((x) => formatarMoeda(x)).join(", ")})`).join("; ")}` : ""}
      </p>

      <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => {
          const qtd =
            a.chave === "omie"
              ? null
              : a.chave === "descontos"
                ? (r.descontos?.noVencimento.qtd ?? 0) + (r.descontos?.soAntecipado.qtd ?? 0) + (r.descontos?.semData.qtd ?? 0)
                : a.chave === "filiais"
                  ? (r.porFilial?.length ?? 0)
                  : a.chave === "exato"
                    ? (r.bateu ?? 0)
                    : a.chave === "aproximado"
                      ? (r.conferir ?? 0)
                      : a.chave === "so_trier"
                        ? (r.soTrier ?? 0) + (r.semArquivo ?? 0)
                        : (r.soDDA ?? 0);
          const ativa = aba === a.chave;
          return (
            <Link key={a.chave} href={`${base}?aba=${a.chave}${sufixoDatas}`} aria-current={ativa ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${ativa ? "border-primary bg-primary text-primary-foreground" : a.chave === "omie" ? "border-fct-yellow bg-fct-yellow/20 hover:border-primary/40" : "bg-card hover:border-primary/40"}`}>
              {a.rotulo} {qtd !== null && <span className={ativa ? "opacity-80" : "text-muted-foreground"}>({qtd})</span>}
            </Link>
          );
        })}
      </nav>

      {aba === "omie" && omie ? (
        <EnvioOmie
          conciliacaoId={c.id}
          contas={omie.contas}
          api={omie.api}
          config={omie.config}
          podeEnviar={podeConciliar(sessao.papel)}
          grupoInicial={grupoOmie}
          marcadas={marcadas}
          validar={validarEnvioOmie}
          enviarPlanilha={enviarPlanilhaOmie}
        />
      ) : aba === "filiais" ? (
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
            {filtros.anomalias && <input type="hidden" name="anomalias" value="1" />}
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
            {filtros.q || filtros.filial !== undefined || filtros.categoria || filtros.anomalias || filtros.vencDe || filtros.vencAte ? (
              <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`${base}?aba=${filtros.grupo}`} />}>
                Limpar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-3 lg:col-span-5">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Vencimento de
                <Input name="venc_de" type="date" defaultValue={filtros.vencDe ?? ""} className="w-40" />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                até
                <Input name="venc_ate" type="date" defaultValue={filtros.vencAte ?? ""} className="w-40" />
              </label>
            </div>
            {(r.anomalias ?? 0) > 0 && filtros.grupo !== "descontos" && (
              <p className="text-xs lg:col-span-5">
                <Link href={`${base}?aba=${filtros.grupo}&anomalias=${filtros.anomalias ? "" : "1"}`} className={`rounded-full border px-2 py-0.5 ${filtros.anomalias ? "border-orange-400 bg-orange-100 text-orange-900" : "text-orange-800 hover:border-orange-300"}`}>
                  <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                  {filtros.anomalias ? "mostrando só fora do padrão — clique para ver todos" : "só fora do padrão"}
                </Link>
              </p>
            )}
          </form>

          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {marcavel && <TableHead className="w-8"><span className="sr-only">Marcar para enviar ao Omie</span></TableHead>}
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
                    <TableCell colSpan={marcavel ? 7 : 6} className="vazio">
                      Nada em “{GRUPO_LABEL[filtros.grupo as GrupoItem] ?? "Descontos"}” com esses filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  itens.map((it) => {
                    const pd = pendencias.get(it.chave);
                    const env = enviados.get(it.chave);
                    const desc = it.desconto as { valor: number; ate: string | null; noVencimento: boolean | null } | null;
                    const dados = it.dados as { filTrier?: number | null; anomalias?: string[] } | null;
                    const anomalias = Array.isArray(dados?.anomalias) ? dados!.anomalias! : [];
                    return (
                      <TableRow key={it.id}>
                        {marcavel && (
                          <TableCell>
                            <input
                              type="checkbox"
                              name="marcar"
                              value={it.chave}
                              form={FORM_MARCAR_OMIE}
                              disabled={!!env}
                              title={env ? "Já enviado ao Omie" : "Marcar para enviar ao Omie"}
                              aria-label={`Marcar ${it.beneficiario ?? it.fornecedor ?? "conta"} para enviar ao Omie`}
                              className="size-4 accent-fct-tinta"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Filial filial={it.filial} />
                          {dados?.filTrier != null && it.filial != null && dados.filTrier !== it.filial && <p className="text-xs text-amber-700">Trier na {dados.filTrier}</p>}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatarData(it.vencimento)}</TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {it.cnpj ? (
                              <Link href={`/conciliacao/fornecedores/${raizDe(it.cnpj)}`} className="hover:underline" title="Ficha do fornecedor">
                                {it.beneficiario ?? it.fornecedor}
                              </Link>
                            ) : (
                              (it.beneficiario ?? it.fornecedor)
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {it.beneficiario && it.fornecedor && it.beneficiario !== it.fornecedor ? `Trier: ${it.fornecedor}` : ""}
                            {it.cnpj ? `${it.beneficiario && it.fornecedor && it.beneficiario !== it.fornecedor ? " · " : ""}${it.cnpj}` : ""}
                            {it.fornecedor_real ? ` · fornecedor real: ${it.fornecedor_real}` : ""}
                          </p>
                          {it.alerta && <p className="text-xs font-semibold text-red-700">ALERTA: {it.alerta}</p>}
                          {anomalias.length > 0 && (
                            <p className={`text-xs font-semibold ${anomalias.some(anomaliaGrave) ? "text-red-700" : "text-orange-700"}`}>
                              <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                              {anomalias.join(" • ")}
                            </p>
                          )}
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
                            {env && <span className="text-xs text-emerald-700"><CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />enviado ao Omie em {formatarData(env.enviado_em)}</span>}
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
          {marcavel && itens.length > 0 && (
            <BarraMarcarOmie
              grupo={filtros.grupo}
              totalDaLista={resultado && resultado.paginas > 1 ? resultado.total : null}
              filtros={{ q: filtros.q, filial: filtros.filial, categoria: filtros.categoria, anomalias: filtros.anomalias, vencDe: filtros.vencDe, vencAte: filtros.vencAte }}
            />
          )}
        </>
      )}
    </>
  );
}
