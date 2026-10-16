import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { PROBLEMA_LABEL, type Problema } from "@/lib/conciliacao/rotulos";
import { aprendizadoDaRaiz, boletosFornecedor, ehRaiz, fichaFornecedor, formatarCnpj, formatarRaiz, nomeBanco, pendenciasDaRaiz } from "@/lib/data/fornecedores";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { BadgeCategoria, BadgeStatusPendencia, Filial } from "../../badges-conc";

export const metadata = { title: "Ficha do fornecedor" };

function Kpi({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string | null; tom?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight tabular-nums ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export default async function FichaFornecedorPage({ params }: PageProps<"/conciliacao/fornecedores/[raiz]">) {
  const [, { raiz }] = await Promise.all([exigirAcesso("/conciliacao/fornecedores"), params]);
  if (!ehRaiz(raiz)) notFound();
  const [ficha, boletos, aprendido, pendencias] = await Promise.all([fichaFornecedor(raiz), boletosFornecedor(raiz), aprendizadoDaRaiz(raiz), pendenciasDaRaiz(raiz)]);

  if (!ficha) {
    return (
      <>
        <PageHeader eyebrow="Conciliação · Fornecedores" titulo={formatarRaiz(raiz)} descricao="Nenhum boleto deste CNPJ passou pela conciliação ainda." acoes={<Button variant="outline" nativeButton={false} render={<Link href="/conciliacao/fornecedores" />}>Voltar</Button>} />
      </>
    );
  }
  const pctAuto = ficha.boletos ? Math.round((ficha.exatos / ficha.boletos) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Conciliação · Fornecedores"
        titulo={ficha.nome ?? formatarRaiz(raiz)}
        descricao={`Raiz do CNPJ ${formatarRaiz(raiz)} · visto pela primeira vez em ${formatarDataHora(ficha.primeiro)} · última conciliação ${formatarDataHora(ficha.ultimo)}`}
        acoes={
          <Button variant="outline" nativeButton={false} render={<Link href="/conciliacao/fornecedores" />}>
            Todos os fornecedores
          </Button>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Boletos vistos" valor={String(ficha.boletos)} nota={`último vencimento ${formatarData(ficha.ultimo_venc)}`} />
        <Kpi rotulo="Total" valor={formatarMoeda(ficha.total)} />
        <Kpi rotulo="Bateram direto" valor={`${pctAuto}%`} nota={`${ficha.exatos} de ${ficha.boletos}`} tom="text-emerald-700" />
        <Kpi rotulo="Divergências" valor={String(ficha.divergencias)} nota="valor, data, filial ou só no DDA" tom={ficha.divergencias ? "text-amber-700" : undefined} />
        <Kpi rotulo="Fora do padrão" valor={String(ficha.fora_padrao)} nota="valor muito acima do histórico" tom={ficha.fora_padrao ? "text-orange-700" : undefined} />
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Faixa normal de valores</h2>
          <p className="text-xs text-muted-foreground">Sem os boletos fora do padrão. Um boleto acima de 4× o P90 (e 8× a mediana, 1,5× o maior) vira aviso.</p>
          <table className="mt-2 w-full">
            <tbody>
              {[
                ["Mínimo", ficha.minimo],
                ["P10", ficha.p10],
                ["Mediana", ficha.mediana],
                ["P90 (normal até)", ficha.p90],
                ["Maior já visto", ficha.maximo],
              ].map(([r, v]) => (
                <tr key={String(r)} className="border-b last:border-0">
                  <td className="py-1">{r}</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(Number(v))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">CNPJs e bancos usados</h2>
          <ul className="space-y-0.5 font-mono text-xs">
            {ficha.cnpjs.map((c) => (
              <li key={c}>{formatarCnpj(c)}</li>
            ))}
          </ul>
          <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bancos emissores</p>
          <ul className="space-y-0.5 text-xs">
            {ficha.bancos.map((b) => (
              <li key={b}>{nomeBanco(b)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Boleto de banco ou CNPJ novo para este fornecedor gera aviso (banco diferente bloqueia o envio ao Omie).</p>
        </section>
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">No Trier e de-para aprendido</h2>
          {ficha.fornecedores.length > 0 ? (
            <ul className="space-y-0.5 text-xs">
              {ficha.fornecedores.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum título do Trier casou com boletos deste CNPJ.</p>
          )}
          {aprendido.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correspondências aprendidas</p>
              <ul className="space-y-0.5 text-xs">
                {aprendido.map((a) => (
                  <li key={a.fornecedor}>
                    {a.fornecedor} <span className="text-muted-foreground">({pluralizar(a.vezes, "vez", "vezes")}{a.confirmado ? ", confirmada" : ""}{a.bloqueado ? ", bloqueada" : ""})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs">
            <Link href="/conciliacao/de-para" className="text-fct-navy underline">
              De-para e aprendizado
            </Link>
          </p>
        </section>
      </div>

      {pendencias.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/40">
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold">Pendências abertas deste fornecedor ({pendencias.length})</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Problema</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden md:table-cell">Detalhe</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendencias.map((p) => (
                <TableRow key={p.chave}>
                  <TableCell className="tabular-nums">{formatarData(p.vencimento)}</TableCell>
                  <TableCell>
                    <Filial filial={p.filial} />
                  </TableCell>
                  <TableCell>{PROBLEMA_LABEL[p.problema as Problema] ?? p.problema}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{p.detalhe}</TableCell>
                  <TableCell>
                    <BadgeStatusPendencia status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-2 text-xs">
            <Link href={`/conciliacao/pendencias?q=${encodeURIComponent(formatarRaiz(raiz))}`} className="text-fct-navy underline">
              Tratar nas pendências
            </Link>
          </p>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">Boletos ({boletos.length}{boletos.length >= 300 ? ", mostrando os 300 mais recentes" : ""})</h2>
          <p className="text-xs text-muted-foreground">Cada boleto conta uma vez (a leitura mais recente). Clique na data para abrir a conciliação.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vencimento</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Beneficiário / fornecedor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="hidden md:table-cell">Banco</TableHead>
              <TableHead className="hidden md:table-cell">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boletos.map((b) => {
              const anom = Array.isArray(b.anomalias) ? (b.anomalias as string[]) : [];
              return (
                <TableRow key={b.chave}>
                  <TableCell className="tabular-nums">
                    <Link href={`/conciliacao/${b.conciliacao_id}?aba=${b.grupo}&q=${encodeURIComponent((b.cnpj_num ?? "").slice(-6))}`} className="hover:underline">
                      {formatarData(b.vencimento)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Filial filial={b.filial} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{b.beneficiario}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.fornecedor && b.fornecedor !== b.beneficiario ? `Trier: ${b.fornecedor}` : ""}
                      {b.fornecedor_real ? ` · fornecedor real: ${b.fornecedor_real}` : ""}
                    </p>
                    {anom.length > 0 && <p className="text-xs font-semibold text-orange-700">⚠ {anom.join(" • ")}</p>}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${b.fora_padrao ? "font-semibold text-orange-700" : ""}`}>{formatarMoeda(b.valor)}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{nomeBanco(b.banco)}</TableCell>
                  <TableCell className="hidden md:table-cell">{b.categoria && <BadgeCategoria categoria={b.categoria} />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
