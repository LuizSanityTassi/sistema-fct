"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CircleCheckBig, FileSpreadsheet, ListChecks, TriangleAlert } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROTULO_SITUACAO_POS, type SituacaoPos } from "@/lib/caixa/planilha-pos";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import type { EstadoPos } from "./actions";

const COR: Record<SituacaoPos, string> = {
  lancar: "border-emerald-200 bg-emerald-50 text-emerald-800",
  duplicada: "border-slate-200 bg-slate-50 text-slate-700",
  farmaceutico: "border-amber-200 bg-amber-50 text-amber-900",
  sem_funcionario: "border-red-200 bg-red-50 text-red-800",
  sem_loja: "border-red-200 bg-red-50 text-red-800",
  invalida: "border-red-200 bg-red-50 text-red-800",
};
const ORDEM: SituacaoPos[] = ["lancar", "farmaceutico", "sem_funcionario", "sem_loja", "invalida", "duplicada"];

type Acao = (prev: EstadoPos, fd: FormData) => Promise<EstadoPos>;

export function ImportarPosForm({ conferir, lancar }: { conferir: Acao; lancar: Acao }) {
  const [conf, enviarConferir, conferindo] = useActionState(conferir, {});
  const [lanc, enviarLancar, lancando] = useActionState(lancar, {});
  const [competencia, setCompetencia] = React.useState("");
  const [arquivoNome, setArquivoNome] = React.useState("");
  const previa = conf.previa;
  const compUsada = competencia || previa?.competencia || competenciaAtual();
  const meses = [...new Set([...Array.from({ length: 6 }, (_, i) => somarMeses(competenciaAtual(), 1 - i)), ...(previa ? [previa.competencia] : [])])].sort().reverse();

  // a mesma planilha serve para conferir e para lançar: o formulário não é limpo entre um e outro
  const submeter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget);
    fd.set("competencia", compUsada);
    React.startTransition(() => (botao?.value === "lancar" ? enviarLancar(fd) : enviarConferir(fd)));
  };

  const vaiLancar = previa?.linhas.filter((l) => l.situacao === "lancar") ?? [];
  const totalLancar = vaiLancar.reduce((s, l) => s + (l.valor ?? 0), 0);
  const travadas = vaiLancar.filter((l) => l.folhaTravada).length;
  const resultado = lanc.resultado;
  const dias = (previa?.linhas ?? [])
    .map((l) => l.dia)
    .filter((d): d is string => !!d)
    .sort();
  const periodo = dias.length ? `&de=${dias[0]}&ate=${dias[dias.length - 1]}` : "";
  const ocupado = conferindo || lancando;

  return (
    <form onSubmit={submeter} className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Planilha POS de quebra de caixa</span>
            <input
              type="file"
              name="arquivo"
              accept=".xlsx,.xls"
              required
              onChange={(e) => {
                setArquivoNome(e.target.files?.[0]?.name ?? "");
                setCompetencia("");
              }}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-fct-tinta file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-fct-tinta/90"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Folha (competência)</span>
            <SelectNativo value={compUsada} onChange={(e) => setCompetencia(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloCompetencia(m)}
                </option>
              ))}
            </SelectNativo>
          </label>
          <Button type="submit" name="passo" value="conferir" variant="outline" disabled={ocupado}>
            <ListChecks data-icon="inline-start" />
            {conferindo ? "Lendo…" : "Conferir"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A planilha vai de 21 a 20 (ex.: 21/08 a 20/09 = folha de setembro): o sistema sugere a folha pela data de corte de cada loja. Nada é gravado ao conferir.
        </p>
      </section>

      <ErroFormulario mensagem={conf.erro ?? lanc.erro} />

      {resultado && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CircleCheckBig className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {resultado.lancadas === 0
                ? "Nada novo para lançar: tudo da planilha já tinha sido importado ou ficou de fora."
                : `${resultado.lancadas === 1 ? "1 quebra lançada" : `${resultado.lancadas} quebras lançadas`} (${formatarMoeda(resultado.valor)}) na folha de ${rotuloCompetencia(compUsada).toLowerCase()}.`}
            </p>
            <p className="mt-0.5">
              Elas aparecem em{" "}
              <Link href={`/financeiro/diferenca-caixa?situacao=pendente${periodo}`} className="font-medium underline">
                Diferença de caixa
              </Link>{" "}
              para o gestor justificar e vão para os Lançamentos da folha. Se foi engano, desfaça o lote logo abaixo.
            </p>
          </div>
        </div>
      )}

      {previa && !resultado && (
        <section className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet className="size-4" aria-hidden />
                {arquivoNome || conf.nomeArquivo} · {previa.abas.join(" e ")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {previa.linhas.length} venda(s) na planilha{previa.corte ? ` · corte em ${formatarData(previa.corte)}` : ""} · folha de {rotuloCompetencia(compUsada).toLowerCase()}
              </p>
            </div>
            <Button
              type="submit"
              name="passo"
              value="lancar"
              disabled={ocupado || vaiLancar.length === 0 || compUsada !== previa.competencia}
              className="bg-fct-yellow text-fct-tinta hover:bg-fct-yellow-dark"
            >
              {lancando ? "Lançando…" : vaiLancar.length ? `Lançar ${vaiLancar.length === 1 ? "1 quebra" : `${vaiLancar.length} quebras`} (${formatarMoeda(totalLancar)})` : "Nada para lançar"}
            </Button>
          </div>
          {compUsada !== previa.competencia && <p className="border-b bg-amber-50 px-5 py-2 text-xs text-amber-900">Você trocou a folha: clique em “Conferir” de novo antes de lançar.</p>}

          <ul className="flex flex-wrap gap-2 px-5 py-3 text-xs">
            {ORDEM.filter((s) => previa.linhas.some((l) => l.situacao === s)).map((s) => {
              const ls = previa.linhas.filter((l) => l.situacao === s);
              return (
                <li key={s} className={`rounded-full border px-2.5 py-1 font-medium ${COR[s]}`}>
                  {ROTULO_SITUACAO_POS[s]}: {ls.length} · {formatarMoeda(ls.reduce((t, l) => t + (l.valor ?? 0), 0))}
                </li>
              );
            })}
          </ul>
          {travadas > 0 && (
            <p className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {travadas} venda(s) de quem já tem quebra digitada/importada pelo RH nesta folha: a quebra é lançada, mas o valor não soma sozinho no lançamento do RH. Avise o RH para conferir.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vendedor na planilha</TableHead>
                <TableHead>Funcionário no sistema</TableHead>
                <TableHead>Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...previa.linhas]
                .sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao) || a.filial.localeCompare(b.filial) || String(a.dia).localeCompare(String(b.dia)))
                .map((l) => (
                  <TableRow key={`${l.aba}-${l.linha}`}>
                    <TableCell>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR[l.situacao]}`}>{ROTULO_SITUACAO_POS[l.situacao]}</span>
                      {l.folhaTravada && <span className="ml-1 text-xs text-amber-800">· folha do RH</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.filial}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(l.dia)}</TableCell>
                    <TableCell className="tabular-nums">{l.venda}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.valor === null ? "—" : formatarMoeda(l.valor)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{l.vendedor ?? "—"}</span> {l.nome}
                    </TableCell>
                    <TableCell>
                      {l.funcionario ? (
                        <>
                          {l.funcionario.nome}
                          <span className="block text-xs text-muted-foreground">
                            {l.funcionario.cargo ?? ""} · {l.funcionario.filial}
                            {l.pelaNome ? " · achado pelo nome, confira" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-red-700">
                          não ligado —{" "}
                          <Link href="/financeiro/diferenca-caixa/operadores" className="underline">
                            ligar operadores
                          </Link>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{l.pagamento || "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </section>
      )}
    </form>
  );
}
