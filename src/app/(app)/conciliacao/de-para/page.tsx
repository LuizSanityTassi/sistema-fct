import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeAtivo } from "@/components/layout/badge-status";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { listarAprendizado, listarDePara } from "@/lib/data/conciliacao";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { excluirDePara, marcarAprendizado } from "../actions";

export const metadata = { title: "De-para de fornecedores" };

const raizFmt = (r: string) => r.trim().replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");

export default async function DeParaPage({ searchParams }: PageProps<"/conciliacao/de-para">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao/de-para"), searchParams]);
  const [depara, aprendizado] = await Promise.all([listarDePara(), listarAprendizado()]);
  const escreve = podeConciliar(sessao.papel);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const aprendidos = [...aprendizado].sort((a, b) => Number(b.confirmado) - Number(a.confirmado) || b.vezes - a.vezes);

  return (
    <>
      <PageHeader
        eyebrow="DDA x Trier"
        titulo="De-para de fornecedores"
        descricao="Boletos em nome de fundos/securitizadoras que na verdade são de um fornecedor, e as correspondências que o sistema aprendeu conciliando."
        acoes={
          escreve ? (
            <Button nativeButton={false} render={<Link href="/conciliacao/de-para/novo" />}>
              <Plus data-icon="inline-start" />
              Novo de-para
            </Button>
          ) : undefined
        }
      />

      {sp.ok === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Salvo." />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <section className="mb-6 rounded-xl border bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Lista do financeiro</h2>
          <p className="text-xs text-muted-foreground">Vale para Varela e Nazário. “Alerta” aparece em vermelho no boleto (ex.: cobrança indevida).</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No DDA (beneficiário começa com)</TableHead>
              <TableHead>Fornecedor real no Trier</TableHead>
              <TableHead className="hidden md:table-cell">Alerta</TableHead>
              <TableHead className="hidden w-24 sm:table-cell">Situação</TableHead>
              {escreve && <TableHead className="w-40" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {depara.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.dda}</TableCell>
                <TableCell>{d.fornecedores.length ? d.fornecedores.join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="hidden md:table-cell">{d.alerta ? <span className="font-semibold text-red-700">{d.alerta}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <BadgeAtivo ativo={d.ativo} />
                </TableCell>
                {escreve && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/conciliacao/de-para/${d.id}/editar`} className="text-sm text-fct-tinta underline">
                        Editar
                      </Link>
                      <ConfirmarAcao titulo={`Excluir “${d.dda}”?`} descricao="A regra deixa de valer nas próximas conciliações. A auditoria guarda o que foi excluído." rotuloBotao="Excluir" variant="destructive" action={excluirDePara} campos={{ id: d.id }} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section id="aprendizado" className="rounded-xl border bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Correspondências aprendidas</h2>
          <p className="text-xs text-muted-foreground">
            Fornecedor do Trier ↔ raiz do CNPJ do boleto, aprendido quando títulos batem com segurança. “Confirmar” fixa a regra; “Bloquear” impede o casamento.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor no Trier</TableHead>
              <TableHead>Beneficiário no boleto</TableHead>
              <TableHead className="hidden md:table-cell">Raiz CNPJ</TableHead>
              <TableHead className="hidden lg:table-cell">Tarifas</TableHead>
              <TableHead className="text-right">Vezes</TableHead>
              <TableHead className="hidden sm:table-cell">Situação</TableHead>
              {escreve && <TableHead className="w-56" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {aprendidos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={escreve ? 7 : 6} className="vazio">
                  Nada aprendido ainda — aparece depois da primeira conciliação.
                </TableCell>
              </TableRow>
            ) : (
              aprendidos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.fornecedor}</TableCell>
                  <TableCell>{a.beneficiario ?? "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{raizFmt(a.raiz)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{a.taxas.filter((t) => t > 0).map((t) => formatarMoeda(t / 100)).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.vezes}
                    <p className="text-xs text-muted-foreground">{formatarData(a.atualizado_em)}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {a.bloqueado ? <span className="text-xs font-semibold text-red-700">Bloqueado</span> : a.confirmado ? <span className="text-xs font-semibold text-emerald-700">Confirmado</span> : <span className="text-xs text-muted-foreground">Aprendido</span>}
                  </TableCell>
                  {escreve && (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {!a.confirmado && !a.bloqueado && (
                          <form action={marcarAprendizado}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="acao" value="confirmar" />
                            <Button type="submit" size="sm" variant="outline">
                              Confirmar
                            </Button>
                          </form>
                        )}
                        <form action={marcarAprendizado}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="acao" value={a.bloqueado ? "desbloquear" : "bloquear"} />
                          <Button type="submit" size="sm" variant="ghost">
                            {a.bloqueado ? "Desbloquear" : "Bloquear"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
