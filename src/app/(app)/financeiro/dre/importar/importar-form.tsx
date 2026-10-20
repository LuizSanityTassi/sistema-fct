"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CircleCheckBig, TriangleAlert } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { moedaFin } from "@/lib/financeiro/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import type { EstadoDre } from "./actions";

type Acao = (prev: EstadoDre, fd: FormData) => Promise<EstadoDre>;

const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");

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
          Cada aba de filial (“CHAPECÓ 302”, “TRIO”…) vira a filial do cadastro (F302, TRIO). Entram só os meses com vendas; um mês que já está no sistema é substituído pelo do arquivo.
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
            <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {previa.empresa} · {previa.filiais.length} filiais · {previa.meses.map(mesCurto).join(", ")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {previa.substitui.length ? `Substitui o que já está no sistema em ${previa.substitui.map(mesCurto).join(", ")}.` : "Meses novos: nada é substituído."}
                </p>
              </div>
              <Button type="submit" name="passo" value="importar" disabled={ocupado || !podeImportar}>
                {importando ? "Importando…" : "Importar"}
              </Button>
            </header>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Receita bruta</TableHead>
                  <TableHead className="text-right">Lucro / prejuízo (com depreciação)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previa.porMes.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell>{rotuloCompetencia(m.mes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(m.vendas)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.lucro < 0 ? "text-red-700" : "text-emerald-700"}`}>{moedaFin(m.lucro)}</TableCell>
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
