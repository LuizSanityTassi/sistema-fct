import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarLotes } from "@/lib/data/financeiro";
import { podeExcluirLancamento, podeLancar } from "@/lib/financeiro/permissoes";
import { ORIGEM_FIN_LABEL } from "@/lib/financeiro/rotulos";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { desfazerLoteImportacao, importarOmie } from "./actions";
import { ImportarForm } from "./importar-form";

export const metadata = { title: "Importar do Omie" };

export default async function ImportarPage({ searchParams }: PageProps<"/financeiro/importar">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/importar"), searchParams]);
  if (!podeLancar(sessao.papel)) redirect("/financeiro");
  const lotes = await listarLotes();
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const inseridos = typeof sp.inseridos === "string" ? Number(sp.inseridos) : null;
  const desfeito = typeof sp.desfeito === "string" ? Number(sp.desfeito) : null;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Importar do Omie" descricao="Traz os lançamentos realizados dos relatórios do Omie para o fluxo de caixa, por unidade, com prévia e proteção contra duplicidade." />

      {inseridos !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>
            {pluralizar(inseridos, "lançamento importado", "lançamentos importados")}
            {Number(sp.pulados ?? 0) > 0 ? ` · ${sp.pulados} duplicado(s) pulado(s)` : ""}.
          </span>
          <Link href="/financeiro/lancamentos?origem=omie" className="underline">
            ver lançamentos
          </Link>
          {typeof sp.lote === "string" && inseridos > 0 && podeExcluirLancamento(sessao.papel) && (
            <ConfirmarAcao titulo="Desfazer esta importação?" descricao={`Remove os ${inseridos} lançamentos deste lote. A auditoria guarda o registro.`} rotuloBotao="Desfazer importação" variant="destructive" action={desfazerLoteImportacao} campos={{ lote: sp.lote }} />
          )}
        </div>
      )}
      {desfeito !== null && (
        <div className="mb-4">
          <AvisoSucesso mensagem={`Importação desfeita: ${pluralizar(desfeito, "lançamento removido", "lançamentos removidos")}.`} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <ImportarForm action={importarOmie} anoPadrao={new Date().getFullYear()} hoje={hoje} />

      <section className="mt-6 rounded-xl border bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Importações recentes</h2>
          <p className="text-xs text-muted-foreground">Cada lote pode ser desfeito inteiro (Administrador e Financeiro). Lançamentos em mês fechado só saem com o administrador.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Lançamentos</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden md:table-cell">Período</TableHead>
              <TableHead className="hidden lg:table-cell">Unidades</TableHead>
              <TableHead className="hidden lg:table-cell">Por</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="vazio">
                  Nenhuma importação ainda.
                </TableCell>
              </TableRow>
            ) : (
              lotes.map((l) => (
                <TableRow key={l.lote_id}>
                  <TableCell className="tabular-nums">{formatarDataHora(l.criado_em)}</TableCell>
                  <TableCell>{ORIGEM_FIN_LABEL[l.origem] ?? l.origem}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.qtd}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(l.total)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatarData(l.de)} a {formatarData(l.ate)}
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">{l.unidades}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{l.quem ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/financeiro/lancamentos?origem=${l.origem}&de=${l.de}&ate=${l.ate}`} />}>
                        Ver
                      </Button>
                      {podeExcluirLancamento(sessao.papel) && l.origem !== "migracao" && (
                        <ConfirmarAcao titulo="Desfazer esta importação?" descricao={`Remove os ${l.qtd} lançamentos deste lote (${formatarMoeda(l.total)}).`} rotuloBotao="Desfazer" variant="destructive" action={desfazerLoteImportacao} campos={{ lote: l.lote_id }} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
