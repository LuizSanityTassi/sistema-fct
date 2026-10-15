import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { movimentadoDoCaixa, type FormaCaixa } from "@/lib/caixa/diferencas";
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { funcionariosDoCaixa, obterCaixa } from "@/lib/data/diferenca-caixa";
import { ehFarmaceutico } from "@/lib/rh/lancamentos";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { decidirQuebra } from "../actions";
import { DecisaoForm } from "./decisao-form";

export const metadata = { title: "Caixa" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function CaixaDetalhePage({ params }: PageProps<"/financeiro/diferenca-caixa/[id]">) {
  const [, { id }] = await Promise.all([exigirAcesso("/financeiro/diferenca-caixa"), params]);
  const [c, funcionarios] = await Promise.all([obterCaixa(id), funcionariosDoCaixa()]);
  if (!c) notFound();
  const funcionario = c.employee_id ? funcionarios.find((x) => x.id === c.employee_id) : undefined;
  const dif = Number(c.diferenca);
  const st = situacaoDoCaixa(c.classe, c.andamento);
  const formas = (Array.isArray(c.formas) ? c.formas : []) as unknown as FormaCaixa[];
  const [ano, mes] = c.competencia.split("-").map(Number);
  const farmaceutico = ehFarmaceutico(funcionario?.cargo);
  const naFolha = c.classe === "quebra" && c.andamento !== "abonada" && !!c.employee_id && !farmaceutico;

  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{valor}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Diferença de caixa"
        titulo={`Caixa ${c.numero_caixa} · ${c.filial?.codigo ?? ""}`}
        descricao={`${c.filial?.nome ?? ""} · aberto em ${formatarData(c.dia)}${c.fechamento && c.fechamento !== c.dia ? `, fechado em ${formatarData(c.fechamento)}` : ""} · lido do Trier em ${formatarDataHora(c.coletado_em)}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/diferenca-caixa?de=${c.dia}&ate=${c.dia}`} />}>
            <ChevronLeft data-icon="inline-start" />
            Caixas do dia
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section aria-labelledby="t-resumo" className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 id="t-resumo" className="text-base font-semibold">
                Dinheiro
              </h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[st]}`}>{ROTULO_SITUACAO[st]}</span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-4">
              {linha("Declarado", formatarMoeda(Number(c.informado)))}
              {linha("Movimentado", formatarMoeda(movimentadoDoCaixa({ informadoDinheiro: Number(c.informado), calculadoDinheiro: dif })))}
              {linha("Diferença", <span className={c.classe === "quebra" ? (dif > 0 ? "text-red-700" : "text-sky-700") : ""}>{textoDiferenca(dif)}</span>)}
              {linha("Desconto na folha", c.classe !== "quebra" ? "—" : naFolha ? `${formatarMoeda(Number(c.valor_quebra))} em ${MESES[mes - 1]}/${ano}` : farmaceutico ? "não (farmacêutico)" : c.andamento === "abonada" ? "não (abonada)" : "não (sem funcionário ligado)")}
            </dl>
            <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
              {linha("Operador no Trier", `${c.cod_operador ?? "—"} · ${c.nome_operador}`)}
              {linha(
                "Funcionário",
                c.employee_id ? (
                  funcionario ? `${funcionario.nome}${funcionario.cargo ? ` · ${funcionario.cargo}` : ""} (${funcionario.filial})` : "funcionário ligado"
                ) : (
                  <Link href="/financeiro/diferenca-caixa/operadores" className="text-amber-800 underline">
                    ligar o operador a um funcionário
                  </Link>
                ),
              )}
            </dl>
          </section>

          <section aria-labelledby="t-formas" className="rounded-xl border bg-card">
            <h2 id="t-formas" className="px-5 pt-4 text-base font-semibold">
              Todas as formas de pagamento (como no Trier)
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Informado</TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Diferença no Trier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formas
                  .filter((x) => x.informado || x.calculado || x.diferenca)
                  .map((x) => (
                    <TableRow key={x.forma}>
                      <TableCell>{x.forma}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(x.informado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(x.calculado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(x.diferenca)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <p className="px-5 pb-4 text-xs text-muted-foreground">
              O operador não declara cartão (vem pelo TEF), então a linha CARTÃO mostra só o vendido. A diferença do caixa é o calculado do DINHEIRO, como na tela da Zanini.
            </p>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="t-just" className="rounded-xl border bg-card p-5">
            <h2 id="t-just" className="mb-2 text-base font-semibold">
              Justificativa
            </h2>
            {c.classe !== "quebra" ? (
              <p className="text-sm text-muted-foreground">Diferença dentro da tolerância: não precisa de justificativa.</p>
            ) : c.justificativa ? (
              <>
                <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{c.justificativa}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.justificada_por_nome ?? "—"} · {formatarDataHora(c.justificada_em)}
                </p>
              </>
            ) : (
              <p className="text-sm text-amber-800">Ainda sem justificativa. Aparece para o colaborador do caixa, o responsável e o gerente da loja em “Quebras de caixa”.</p>
            )}
          </section>

          {c.classe === "quebra" && (
            <section aria-labelledby="t-decisao" className="rounded-xl border bg-card p-5">
              <h2 id="t-decisao" className="mb-1 text-base font-semibold">
                Decisão do financeiro
              </h2>
              {c.decidida_em && (
                <p className="mb-3 text-xs text-muted-foreground">
                  {ROTULO_SITUACAO[st]} por {c.decidida_por_nome ?? "—"} em {formatarDataHora(c.decidida_em)}
                  {c.decisao_obs ? ` — “${c.decisao_obs}”` : ""}
                </p>
              )}
              <DecisaoForm action={decidirQuebra.bind(null, c.id)} andamento={c.andamento} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
