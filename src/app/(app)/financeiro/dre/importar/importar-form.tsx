"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CircleCheckBig, TriangleAlert } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { moedaFin } from "@/lib/financeiro/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import type { EstadoDre } from "./actions";

type Acao = (prev: EstadoDre, fd: FormData) => Promise<EstadoDre>;

const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");

/**
 * O que gravar da planilha: só o mês novo (padrão: o mais recente que ainda não está no sistema) ou todos os meses
 * (substitui os que já estão). O contador manda a planilha do ano inteiro todo mês; o normal é gravar só o mês novo.
 */
function EscolhaDoMes({ meses, jaNoSistema, desabilitado, importando }: { meses: string[]; jaNoSistema: string[]; desabilitado: boolean; importando: boolean }) {
  const novos = meses.filter((m) => !jaNoSistema.includes(m));
  const [modo, setModo] = React.useState<"mes" | "todos">("mes");
  const [mes, setMes] = React.useState(novos.at(-1) ?? meses.at(-1) ?? "");
  const substitui = modo === "todos" ? jaNoSistema : jaNoSistema.filter((m) => m === mes);
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b px-5 py-4">
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 font-medium">O que importar</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="modo" value="mes" checked={modo === "mes"} onChange={() => setModo("mes")} className="size-4 accent-fct-tinta" />
          Só o mês
          <SelectNativo name="mes" value={mes} onChange={(e) => setMes(e.target.value)} disabled={modo !== "mes"} aria-label="Mês a importar" className="h-8 w-52">
            {[...meses].reverse().map((m) => (
              <option key={m} value={m}>
                {rotuloCompetencia(m)}
                {jaNoSistema.includes(m) ? " (já no sistema)" : " (novo)"}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="modo" value="todos" checked={modo === "todos"} onChange={() => setModo("todos")} className="size-4 accent-fct-tinta" />
          Todos os {meses.length} meses da planilha
        </label>
      </fieldset>
      <div className="grid gap-1">
        <Button type="submit" name="passo" value="importar" disabled={desabilitado}>
          {importando ? "Importando…" : modo === "mes" ? `Importar ${mesCurto(mes)}` : "Importar todos os meses"}
        </Button>
        <p className="text-xs text-muted-foreground">{substitui.length ? `Substitui o que já está no sistema em ${substitui.map(mesCurto).join(", ")}.` : "Mês novo: nada é substituído."}</p>
      </div>
    </div>
  );
}

export function ImportarDreForm({ conferir, importar }: { conferir: Acao; importar: Acao }) {
  const [conf, enviarConferir, conferindo] = useActionState(conferir, {});
  const [imp, enviarImportar, importando] = useActionState(importar, {});
  const [arquivoNome, setArquivoNome] = React.useState("");
  const previa = conf.previa;
  const ocupado = conferindo || importando;

  // a mesma planilha serve para conferir e para importar: o formulário não é limpo entre um e outro
  const submeter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget);
    React.startTransition(() => (botao?.value === "importar" ? enviarImportar(fd) : enviarConferir(fd)));
  };

  const podeImportar = !!previa && !previa.erro && previa.semCadastro.length === 0 && conf.nomeArquivo === arquivoNome;

  return (
    <form onSubmit={submeter} className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Planilha “DRE POR FILIAIS” do contador</span>
            <input
              type="file"
              name="arquivo"
              accept=".xlsx,.xls"
              required
              onChange={(e) => setArquivoNome(e.target.files?.[0]?.name ?? "")}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          </label>
          <Button type="submit" name="passo" value="conferir" variant="outline" disabled={ocupado}>
            {conferindo ? "Conferindo…" : "Conferir"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Todo mês o contador manda a planilha atualizada: confira e importe só o mês novo (os meses anteriores ficam como estão). Cada aba de filial (“CHAPECÓ 302”, “TRIO”…) vira a filial do cadastro (F302, TRIO); entram só os meses com vendas.
        </p>
      </section>

      <ErroFormulario mensagem={conf.erro ?? imp.erro ?? previa?.erro} />

      {imp.resultado && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CircleCheckBig className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            DRE da {imp.resultado.empresa} importada: {imp.resultado.meses.map(mesCurto).join(", ")} · {imp.resultado.filiais} filiais.{" "}
            <Link href="/financeiro/dre" className="font-medium underline">
              Ver a DRE
            </Link>
          </span>
        </p>
      )}

      {previa && !previa.erro && (
        <>
          <section className="rounded-xl border bg-card">
            <header className="border-b px-5 py-3">
              <h2 className="text-sm font-semibold">
                {previa.empresa} · {previa.filiais.length} filiais · {previa.meses.map(mesCurto).join(", ")}
              </h2>
            </header>
            <EscolhaDoMes key={`${conf.nomeArquivo}|${previa.meses.join()}`} meses={previa.meses} jaNoSistema={previa.substitui} desabilitado={ocupado || !podeImportar} importando={importando} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Receita bruta</TableHead>
                  <TableHead className="text-right">Lucro / prejuízo (com depreciação)</TableHead>
                  <TableHead className="hidden sm:table-cell">No sistema</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previa.porMes.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell>{rotuloCompetencia(m.mes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(m.vendas)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.lucro < 0 ? "text-red-700" : "text-emerald-700"}`}>{moedaFin(m.lucro)}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">{previa.substitui.includes(m.mes) ? <span className="text-muted-foreground">já importado</span> : <span className="font-medium text-emerald-700">novo</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {(previa.semCadastro.length > 0 || previa.diferencas.length > 0 || previa.mesesSemVendas.length > 0) && (
            <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4" aria-hidden /> Atenção
              </p>
              {previa.semCadastro.length > 0 && <p>Abas sem filial no cadastro (cadastre antes de importar): {previa.semCadastro.join(", ")}.</p>}
              {previa.mesesSemVendas.map((m) => (
                <p key={m.mes}>
                  {rotuloCompetencia(m.mes)} fica de fora: ainda sem vendas (tem {moedaFin(m.lancado)} lançados, como depreciação e despesa financeira já previstas).
                </p>
              ))}
              {previa.diferencas.length > 0 && (
                <p>
                  O lucro de {previa.diferencas.length} filial(is) × mês na planilha é diferente da conta do sistema (fórmula da planilha pulando alguma linha):{" "}
                  {previa.diferencas
                    .slice(0, 8)
                    .map((d) => `${d.codigo} ${mesCurto(d.mes)}: planilha ${moedaFin(d.planilha)}, sistema ${moedaFin(d.sistema)}`)
                    .join(" · ")}
                  .
                </p>
              )}
            </section>
          )}

          <details className="rounded-xl border bg-card px-5 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Abas lidas ({previa.filiais.length} filiais)</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {previa.filiais.map((f) => (
                <li key={f.aba} className={f.nome ? "" : "text-red-700"}>
                  {f.aba} → <span className="font-mono text-xs">{f.codigo}</span> {f.nome ?? "(não cadastrada)"}
                </li>
              ))}
            </ul>
            {previa.abasIgnoradas.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Abas de resumo (o sistema calcula sozinho): {previa.abasIgnoradas.join(", ")}.</p>}
          </details>
        </>
      )}
    </form>
  );
}
