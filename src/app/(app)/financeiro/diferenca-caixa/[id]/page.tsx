import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { movimentadoDoCaixa, type FormaCaixa } from "@/lib/caixa/diferencas";
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { gruposDeGestores } from "@/lib/caixa/gestores";
import { anexosDasQuebras, funcionariosDoCaixa, gestoresDasLojas, obterCaixa, quebraNaFolha, usuariosDoCaixa } from "@/lib/data/diferenca-caixa";
import { empresaDasFiliais } from "@/lib/data/filiais";
import { semQuebraDeCaixa } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { periodoDaQuebra } from "@/lib/rh/competencia";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { decidirQuebra, excluirQuebraManual, moverGestorQuebra } from "../actions";
import { GestorForm } from "../gestores/gestor-form";
import { AnexosQuebra } from "../../../caixa/anexos-quebra";
import { DecisaoForm } from "./decisao-form";
import { ExcluirQuebraManual } from "./excluir-manual";

export const metadata = { title: "Caixa" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function CaixaDetalhePage({ params }: PageProps<"/financeiro/diferenca-caixa/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/financeiro/diferenca-caixa"), params]);
  const [c, funcionarios, usuarios, gestores, anexos] = await Promise.all([obterCaixa(id), funcionariosDoCaixa(), usuariosDoCaixa(), gestoresDasLojas(), anexosDasQuebras([id])]);
  if (!c) notFound();
  const manual = c.origem === "manual";
  const nomeGestor = c.gestor_id ? (usuarios.find((u) => u.id === c.gestor_id)?.nome ?? "usuário inativo") : null;
  const gestorDaLoja = gestores.get(c.branch_id)?.profile_id;
  const funcionario = c.employee_id ? funcionarios.find((x) => x.id === c.employee_id) : undefined;
  const dif = Number(c.diferenca);
  const st = situacaoDoCaixa(c.classe, c.andamento);
  const formas = (Array.isArray(c.formas) ? c.formas : []) as unknown as FormaCaixa[];
  const [ano, mes] = c.competencia.split("-").map(Number);
  const empresas = funcionario ? await empresaDasFiliais(await createClient()) : new Map<string, string | null>();
  const farmaceutico = !!funcionario && semQuebraDeCaixa(funcionario.cargo, funcionario.branch_id ? empresas.get(funcionario.branch_id) : null);
  const folhaLigada = await quebraNaFolha();
  const naFolha = folhaLigada && c.classe === "quebra" && c.andamento !== "abonada" && !!c.employee_id && !farmaceutico;

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
        titulo={manual ? `Quebra manual · ${c.filial?.codigo ?? ""}` : `Caixa ${c.numero_caixa} · ${c.filial?.codigo ?? ""}`}
        descricao={
          manual
            ? `${c.filial?.nome ?? ""} · ${formatarData(c.dia)} · lançada por ${c.lancada_por_nome ?? "—"} em ${formatarDataHora(c.coletado_em)}`
            : `${c.filial?.nome ?? ""} · aberto em ${formatarData(c.dia)}${c.fechamento && c.fechamento !== c.dia ? `, fechado em ${formatarData(c.fechamento)}` : ""} · lido do Trier em ${formatarDataHora(c.coletado_em)}`
        }
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
              {linha("Declarado", manual ? "—" : formatarMoeda(Number(c.informado)))}
              {linha(
                "Movimentado",
                manual
                  ? "—"
                  : formatarMoeda(
                      movimentadoDoCaixa({
                        informadoDinheiro: Number(c.informado),
                        calculadoDinheiro: dif,
                      }),
                    ),
              )}
              {linha("Diferença", <span className={c.classe === "quebra" ? (dif > 0 ? "text-red-700" : "text-sky-700") : ""}>{textoDiferenca(dif)}</span>)}
              {linha(
                "Desconto na folha",
                c.classe !== "quebra"
                  ? "—"
                  : naFolha
                    ? `${formatarMoeda(Number(c.valor_quebra))} em ${MESES[mes - 1]}/${ano} (caixas de ${periodoDaQuebra(c.competencia.slice(0, 7))})`
                    : !folhaLigada
                      ? "não (quebra na folha desligada)"
                      : farmaceutico
                      ? "não (farmacêutico da Varela)"
                      : c.andamento === "abonada"
                        ? "não (abonada)"
                        : "não (sem funcionário ligado)",
              )}
            </dl>
            <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
              {linha(manual ? "Colaborador" : "Operador no Trier", manual ? c.nome_operador : `${c.cod_operador ?? "—"} · ${c.nome_operador}`)}
              {linha(
                "Funcionário",
                c.employee_id ? (
                  funcionario ? (
                    `${funcionario.nome}${funcionario.cargo ? ` · ${funcionario.cargo}` : ""} (${funcionario.filial})`
                  ) : (
                    "funcionário ligado"
                  )
                ) : (
                  <Link href="/financeiro/diferenca-caixa/operadores" className="text-amber-800 underline">
                    ligar o operador a um funcionário
                  </Link>
                ),
              )}
            </dl>
            {manual && c.descricao && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs text-muted-foreground">Motivo (lançamento manual)</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.descricao}</p>
              </div>
            )}
          </section>

          {!manual && (
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
          )}
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
              <p className="text-sm text-amber-800">Ainda sem justificativa. O gestor justifica em “Quebras de caixa” (o colaborador só vê).</p>
            )}
            {c.classe === "quebra" && (anexos.get(c.id) ?? []).length > 0 && (
              <div className="mt-3">
                <AnexosQuebra anexos={anexos.get(c.id) ?? []} usuarioId={sessao.id} podeRemoverTodos aberta={c.andamento === "pendente" || c.andamento === "justificada"} />
              </div>
            )}
          </section>

          {c.classe === "quebra" && (
            <section aria-labelledby="t-gestor" className="rounded-xl border bg-card p-5">
              <h2 id="t-gestor" className="mb-1 text-base font-semibold">
                Gestor que justifica
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                {nomeGestor ? `Hoje: ${nomeGestor}.` : "Sem gestor definido: fica com o gerente cadastrado na loja."}
                {gestorDaLoja && gestorDaLoja !== c.gestor_id ? " É diferente do gestor da loja." : ""} Troque se a pessoa estiver de férias ou se o colaborador trabalhou em outra loja.
              </p>
              <GestorForm key={c.gestor_id ?? ""} action={moverGestorQuebra.bind(null, c.id)} atual={c.gestor_id} grupos={gruposDeGestores(usuarios)} rotulo="Gestor que justifica esta quebra" />
            </section>
          )}

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
              {manual && (
                <div className="mt-4 border-t pt-3">
                  <ExcluirQuebraManual action={excluirQuebraManual.bind(null, c.id)} />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
