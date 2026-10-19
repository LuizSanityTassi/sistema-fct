import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, FileText, Laptop, Pencil, ReceiptText, Stethoscope, UserRound } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { COR_SITUACAO, ROTULO_CURTO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { ACOES_AUDITADAS, ENTIDADES_AUDITADAS } from "@/lib/data/auditoria";
import { carregarFicha360, ITENS_DESLIGAMENTO } from "@/lib/data/ficha-funcionario";
import { listarFolhaDoFuncionario } from "@/lib/data/folha";
import { listarSalarios, obterFuncionario } from "@/lib/data/funcionarios";
import { podeAcessar } from "@/lib/nav";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { ASO_TIPO_LABEL, CONTRATO_LABEL, FOLHA_STATUS_LABEL } from "@/lib/rh/rotulos";
import { PAPEL_LABEL, ehPapel } from "@/lib/roles";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";
import { anosDesde, descreverPeriodo, formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { mascararCpf } from "@/lib/validacao/cpf";
import { alterarStatusFuncionario, marcarItemDesligamento } from "../actions";
import { AlterarStatusFuncionario } from "../alterar-status";
import { ChecklistDesligamento, type ItemAutomatico, type ItemManual } from "./checklist-desligamento";
import { DocumentosEAso } from "./documentos-aso";

export async function generateMetadata({ params }: PageProps<"/rh/funcionarios/[id]">): Promise<Metadata> {
  const { id } = await params;
  const f = await obterFuncionario(id);
  return { title: f ? f.nome : "Funcionário" };
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor?: string | number | null; mono?: boolean }) {
  return (
    <div>
      <dt className="sobrescrito">{rotulo}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{valor === null || valor === undefined || valor === "" ? "—" : valor}</dd>
    </div>
  );
}

const ABAS = [
  { chave: "geral", rotulo: "Visão geral", soRh: false },
  { chave: "documentos", rotulo: "Documentos e ASO", soRh: false },
  { chave: "folha", rotulo: "Folha", soRh: true },
  { chave: "caixa", rotulo: "Quebras de caixa", soRh: false },
  { chave: "ti", rotulo: "TI e acessos", soRh: false },
  { chave: "historico", rotulo: "Histórico", soRh: true },
] as const;
type Aba = (typeof ABAS)[number]["chave"];

const fmtValor = (v: number, unidade: string) => (unidade === "horas" ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h` : formatarMoeda(v));
// mês atual no horário de Brasília (UTC−3), em aaaa-mm
const mesNoBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);

export default async function FuncionarioPage({ params, searchParams }: PageProps<"/rh/funcionarios/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/rh/funcionarios"), params, searchParams]);
  const f = await obterFuncionario(id);
  if (!f) notFound();
  const podeEditar = sessao.papel === "admin" || sessao.papel === "rh";
  const abas = ABAS.filter((a) => !a.soRh || podeEditar);
  const aba: Aba = abas.some((a) => a.chave === sp.aba) ? (sp.aba as Aba) : "geral";
  const [ficha, salarios, folhas] = await Promise.all([carregarFicha360(id, sessao.papel), podeEditar ? listarSalarios(id) : Promise.resolve([]), podeEditar ? listarFolhaDoFuncionario(id) : Promise.resolve([])]);
  const vigente = salarios.find((s) => !s.vigencia_fim) ?? salarios[0];

  const unidade = f.unidade;
  const grupo = unidade?.organizations?.nome_fantasia ?? "";
  const idade = anosDesde(f.data_nascimento);
  const tempoCasa = f.status === "desligado" ? null : descreverPeriodo(f.data_admissao);
  const linkAba = (a: Aba, ancora = "") => `/rh/funcionarios/${f.id}?aba=${a}${ancora}`;
  const compAtual = mesNoBrasil();
  const mesAtual = ficha.folhaPorMes.find((m) => m.competencia.slice(0, 7) === compAtual);
  const quebrasNoMes = ficha.quebras.filter((q) => q.competencia.slice(0, 7) === compAtual && q.andamento !== "abonada").reduce((s, q) => s + Number(q.valor_quebra), 0);

  const asoTexto =
    ficha.situacaoAso === "sem"
      ? "Sem ASO"
      : ficha.situacaoAso === "vencido"
        ? `Vencido em ${formatarData(ficha.asoAtual?.data_validade)}`
        : ficha.situacaoAso === "vencendo"
          ? `Vence em ${formatarData(ficha.asoAtual?.data_validade)}`
          : `Válido até ${formatarData(ficha.asoAtual?.data_validade)}`;
  const resumo: { rotulo: string; valor: string; nota?: string; href: string; icone: typeof Coins; tom: string }[] = [
    { rotulo: "ASO", valor: asoTexto, href: linkAba("documentos", "#aso"), icone: Stethoscope, tom: ficha.situacaoAso === "vencido" ? "text-red-700" : ficha.situacaoAso === "vencendo" ? "text-amber-700" : ficha.situacaoAso === "sem" ? "text-muted-foreground" : "text-emerald-700" },
    { rotulo: "Documentos", valor: ficha.documentos.length ? `${ficha.documentos.length} arquivo(s)` : "Nenhum", href: linkAba("documentos", "#documentos"), icone: FileText, tom: ficha.documentos.length ? "" : "text-muted-foreground" },
    {
      rotulo: "Quebras de caixa",
      valor: ficha.quebrasAbertas ? `${ficha.quebrasAbertas} em aberto` : ficha.quebras.length ? "Nenhuma em aberto" : "Nenhuma",
      nota: quebrasNoMes ? `${formatarMoeda(quebrasNoMes)} neste mês` : undefined,
      href: linkAba("caixa"),
      icone: Coins,
      tom: ficha.quebrasAbertas ? "text-orange-700" : "text-muted-foreground",
    },
    ...(podeEditar
      ? [{ rotulo: "Folha do mês", valor: mesAtual?.eventos.length ? `${mesAtual.eventos.length} lançamento(s)` : "Sem lançamento", nota: mesAtual?.observacao?.pendente ? "observação pendente" : undefined, href: linkAba("folha"), icone: ReceiptText, tom: mesAtual?.observacao?.pendente ? "text-amber-700" : "" }]
      : []),
    { rotulo: "Equipamentos", valor: ficha.ativos.length ? `${ficha.ativos.length} no nome dele(a)` : "Nenhum", href: linkAba("ti"), icone: Laptop, tom: ficha.ativos.length ? "" : "text-muted-foreground" },
    {
      rotulo: "Usuário do sistema",
      valor: ficha.usuario ? (ficha.usuario.ativo ? "Tem login" : "Login desativado") : "Sem login",
      nota: ficha.usuario && ehPapel(ficha.usuario.papel) ? PAPEL_LABEL[ficha.usuario.papel] : undefined,
      href: linkAba("ti"),
      icone: UserRound,
      tom: ficha.usuario?.ativo ? "" : "text-muted-foreground",
    },
  ];

  // checklist do desligamento: o que o sistema confere sozinho + o que o RH marca
  const automaticos: ItemAutomatico[] = [
    { id: "registro", rotulo: "Registrar o desligamento", feito: !!f.data_desligamento, detalhe: f.data_desligamento ? `Desligado em ${formatarData(f.data_desligamento)}` : "Falta a data do desligamento" },
    ficha.usuario?.ativo
      ? { id: "usuario", rotulo: "Bloquear o usuário do sistema", feito: false, detalhe: `Login de ${ficha.usuario.email ?? ficha.usuario.nome} ainda ativo`, href: sessao.papel === "admin" ? `/configuracoes/usuarios/${ficha.usuario.id}/editar` : undefined, acao: "Desativar usuário" }
      : { id: "usuario", rotulo: "Bloquear o usuário do sistema", feito: true, detalhe: ficha.usuario ? "Login desativado" : "Não tem usuário no sistema" },
    { id: "quebras", rotulo: "Resolver as quebras de caixa em aberto", feito: ficha.quebrasAbertas === 0, detalhe: ficha.quebrasAbertas ? `${ficha.quebrasAbertas} em aberto` : "Nenhuma em aberto", href: linkAba("caixa"), acao: "Ver quebras" },
  ];
  const compSaida = (f.data_desligamento ?? "").slice(0, 7) || compAtual;
  const manuais: ItemManual[] = ITENS_DESLIGAMENTO.map(({ item, rotulo }) => {
    const c = ficha.checklist.get(item);
    const base = { item, rotulo, feito: !!c, quem: c?.feito_por_nome ?? null, quando: c ? formatarDataHora(c.feito_em) : null };
    if (item === "equipamentos") return { ...base, detalhe: ficha.ativos.length ? `${ficha.ativos.length} equipamento(s) no nome dele(a) no inventário` : "Nenhum equipamento no inventário (confira mesmo assim)", href: linkAba("ti"), acao: "Ver equipamentos" };
    if (item === "acessos") return { ...base, href: `/chamados/novo?${new URLSearchParams({ categoria: "ti", titulo: `Revogar acessos de ${f.nome}`.slice(0, 120), ...(unidade ? { filial: unidade.id } : {}) })}`, acao: "Abrir chamado na TI" };
    if (item === "folha") return { ...base, href: `/rh/lancamentos?competencia=${compSaida}`, acao: "Abrir lançamentos" };
    return base;
  });

  const linhaDoTempo = [
    ...(f.data_admissao ? [{ quando: f.data_admissao, titulo: "Admissão", detalhe: f.cargo ?? "" }] : []),
    ...(f.data_desligamento ? [{ quando: f.data_desligamento, titulo: "Desligamento", detalhe: "" }] : []),
    ...salarios.map((s) => ({ quando: s.vigencia_inicio, titulo: `Salário ${formatarMoeda(s.salario)}`, detalhe: s.origem ?? "" })),
    ...ficha.asos.map((a) => ({ quando: a.data_realizacao ?? a.created_at.slice(0, 10), titulo: `ASO ${ASO_TIPO_LABEL[a.tipo] ?? a.tipo}`, detalhe: a.data_validade ? `válido até ${formatarData(a.data_validade)}` : "" })),
    ...ficha.documentos.map((d) => ({ quando: d.created_at, titulo: `Documento: ${d.nome}`, detalhe: "" })),
    ...ficha.quebras.map((q) => ({ quando: q.dia, titulo: `Quebra de caixa: ${textoDiferenca(Number(q.diferenca)).toLowerCase()}`, detalhe: `${q.filial?.codigo ?? ""} · ${ROTULO_CURTO[situacaoDoCaixa("quebra", q.andamento)]}` })),
    ...ficha.historico.map((h) => ({
      quando: h.criado_em,
      titulo: `${ACOES_AUDITADAS[h.acao] ?? h.acao} ${(ENTIDADES_AUDITADAS[h.entidade] ?? h.entidade).toLowerCase()}`,
      detalhe: `por ${h.autor}${h.valor_novo && typeof h.valor_novo === "object" && !Array.isArray(h.valor_novo) ? ` · ${Object.keys(h.valor_novo).slice(0, 6).join(", ")}` : ""}`,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  return (
    <>
      <PageHeader
        eyebrow={[unidade ? `${unidade.codigo} · ${unidade.nome}` : null, grupo].filter(Boolean).join(" · ")}
        titulo={f.nome}
        descricao={
          [f.cargo, f.matricula ? `matrícula ${f.matricula}` : null, f.status === "desligado" ? (f.data_desligamento ? `desligado em ${formatarData(f.data_desligamento)}` : "desligado") : f.data_admissao ? `ativo desde ${formatarData(f.data_admissao)}` : null]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        acoes={
          podeEditar ? (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href={`/rh/funcionarios/${f.id}/editar`} />}>
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
              <AlterarStatusFuncionario id={f.id} statusAtual={f.status} dataDesligamento={f.data_desligamento} action={alterarStatusFuncionario} />
            </>
          ) : undefined
        }
      />

      {sp.salvo === "1" && (
        <div className="mb-6">
          <AvisoSucesso mensagem="Funcionário salvo com sucesso." />
        </div>
      )}

      <nav aria-label="Seções da ficha" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={linkAba(a.chave)}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${aba === a.chave ? "border-primary font-semibold text-fct-tinta" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {a.rotulo}
            {a.chave === "caixa" && ficha.quebrasAbertas > 0 && <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-800">{ficha.quebrasAbertas}</span>}
          </Link>
        ))}
      </nav>

      {aba === "geral" && (
        <>
          {f.status === "desligado" && podeEditar && <ChecklistDesligamento automaticos={automaticos} manuais={manuais} marcar={marcarItemDesligamento.bind(null, f.id)} podeMarcar={podeEditar} />}

          <section aria-label="Resumo" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {resumo.map((r) => (
              <Link key={r.rotulo} href={r.href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
                <span className="flex items-center gap-1.5 rotulo">
                  <r.icone className="size-3.5" aria-hidden />
                  {r.rotulo}
                </span>
                <span className={`mt-1 block text-sm font-semibold ${r.tom}`}>{r.valor}</span>
                {r.nota && <span className="block text-xs text-muted-foreground">{r.nota}</span>}
              </Link>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Situação</h2>
                <BadgeStatusFuncionario status={f.status} />
              </div>
              <dl className="grid gap-4">
                <Dado rotulo="Admissão" valor={f.data_admissao ? `${formatarData(f.data_admissao)}${tempoCasa ? ` · ${tempoCasa}` : ""}` : null} />
                {f.status === "desligado" && <Dado rotulo="Desligamento" valor={formatarData(f.data_desligamento)} />}
                <Dado rotulo="Unidade" valor={unidade ? `${unidade.codigo} — ${unidade.nome}${unidade.regional ? ` (${unidade.regional})` : ""}` : null} />
                <Dado rotulo="Departamento" valor={f.departamento?.nome} />
              </dl>
              {unidade && (
                <Link href={`/filiais/${unidade.id}`} className="mt-4 inline-block text-sm text-fct-tinta underline">
                  Ver unidade
                </Link>
              )}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Contrato</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Dado rotulo="Matrícula" valor={f.matricula} mono />
                <Dado rotulo="Tipo" valor={f.tipo_contrato ? CONTRATO_LABEL[f.tipo_contrato] : null} />
                <Dado rotulo="Categoria" valor={f.categoria} />
                <Dado rotulo="Horas/mês" valor={f.horas_mes !== null ? String(f.horas_mes) : null} />
                <Dado rotulo="Sindicato" valor={f.contribui_sindicato === null ? null : f.contribui_sindicato ? "Contribui" : "Não contribui"} />
                <Dado rotulo="FGTS" valor={f.optante_fgts === null ? null : f.optante_fgts ? "Optante" : "Não optante"} />
                <Dado rotulo="Filhos" valor={f.num_filhos} />
                <Dado rotulo="Dependentes" valor={f.num_dependentes} />
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Dados pessoais</h2>
              <dl className="grid gap-4">
                <Dado rotulo="CPF" valor={podeEditar ? (f.cpf ?? null) : mascararCpf(f.cpf)} mono />
                <Dado rotulo="Nascimento" valor={f.data_nascimento ? `${formatarData(f.data_nascimento)}${idade !== null ? ` · ${idade} anos` : ""}` : null} />
                <Dado rotulo="E-mail" valor={f.email} />
                <Dado rotulo="Telefone" valor={f.telefone} />
              </dl>
            </section>
          </div>

          {f.observacoes && (
            <section className="mt-4 rounded-xl border bg-card p-5">
              <h2 className="mb-2 text-sm font-semibold">Observações</h2>
              <p className="text-sm whitespace-pre-line">{f.observacoes}</p>
            </section>
          )}
        </>
      )}

      {aba === "documentos" && <DocumentosEAso employeeId={f.id} podeEditar={podeEditar} />}

      {aba === "folha" && podeEditar && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 text-sm font-semibold">Remuneração</h2>
            {salarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum salário registrado.</p>
            ) : (
              <>
                <p className="mb-4 numero">
                  {formatarMoeda(vigente?.salario)} <span className="text-sm font-normal text-muted-foreground">/ mês</span>
                </p>
                <ul className="divide-y text-sm">
                  {salarios.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 py-1.5">
                      <span>
                        {formatarData(s.vigencia_inicio)} → {s.vigencia_fim ? formatarData(s.vigencia_fim) : "atual"}
                      </span>
                      <span className="tabular-nums">{formatarMoeda(s.salario)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {folhas.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="mb-2 rotulo">Folha recente</p>
                <ul className="divide-y text-sm">
                  {folhas.map((fl) => (
                    <li key={fl.id} className="flex items-center justify-between gap-3 py-1.5">
                      <Link href={`/rh/folha/${fl.id}`} className="hover:underline">
                        {rotuloCompetencia(fl.competencia)}
                      </Link>
                      <span className="text-xs text-muted-foreground">{FOLHA_STATUS_LABEL[fl.status]}</span>
                      <span className="tabular-nums">{formatarMoeda(fl.valor_liquido)}</span>
                      {fl.storage_path ? (
                        <a href={`/api/arquivos/holerite/${fl.id}`} className="text-xs text-fct-tinta underline">
                          holerite
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold">Lançamentos da folha (para a contabilidade)</h2>
            <p className="mb-3 text-xs text-muted-foreground">Horas extras, adicional noturno, quebra de caixa e os demais eventos de cada mês.</p>
            {ficha.folhaPorMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
            ) : (
              <ul className="divide-y">
                {ficha.folhaPorMes.map((m) => (
                  <li key={m.competencia} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/rh/lancamentos?competencia=${m.competencia.slice(0, 7)}`} className="text-sm font-medium hover:underline">
                        {rotuloCompetencia(m.competencia.slice(0, 7))}
                      </Link>
                      {m.observacao?.pendente && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">observação pendente</span>}
                    </div>
                    {m.eventos.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.eventos.map((e) => (
                          <li key={e.evento} className="rounded-md border bg-muted/30 px-2 py-0.5 text-xs">
                            {e.evento}: <span className="font-medium tabular-nums">{fmtValor(e.valor, e.unidade)}</span>
                            {e.origem === "caixa" && <span className="text-muted-foreground"> (caixa)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.observacao?.texto && <p className="mt-1.5 text-xs text-muted-foreground">Obs.: {m.observacao.texto}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {aba === "caixa" && (
        <section className="rounded-xl border bg-card">
          {ficha.quebras.length === 0 ? (
            <p className="vazio">Nenhuma quebra de caixa ligada a este funcionário.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Caixa</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Folha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ficha.quebras.map((q) => {
                  const st = situacaoDoCaixa("quebra", q.andamento);
                  const dif = Number(q.diferenca);
                  const rotuloCaixa = q.origem === "manual" ? "manual" : q.numero_caixa;
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="whitespace-nowrap">{formatarData(q.dia)}</TableCell>
                      <TableCell className="font-mono text-xs">{q.filial?.codigo ?? "—"}</TableCell>
                      <TableCell>
                        {podeAcessar(sessao.papel, "/financeiro/diferenca-caixa") ? (
                          <Link href={`/financeiro/diferenca-caixa/${q.id}`} className="font-mono text-fct-tinta hover:underline">
                            {rotuloCaixa}
                          </Link>
                        ) : (
                          <span className="font-mono">{rotuloCaixa}</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium whitespace-nowrap tabular-nums ${dif > 0 ? "text-red-700" : "text-sky-700"}`}>{textoDiferenca(dif)}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${COR_SITUACAO[st]}`}>{ROTULO_CURTO[st]}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.andamento === "abonada" ? "não desconta" : rotuloCompetencia(q.competencia.slice(0, 7))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {aba === "ti" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card lg:col-span-2">
            <h2 className="px-5 pt-4 text-sm font-semibold">Equipamentos no nome dele(a)</h2>
            {ficha.ativos.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum equipamento no inventário de TI com este funcionário como responsável.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Patrimônio</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ficha.ativos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {podeAcessar(sessao.papel, "/ti/ativos") ? (
                          <Link href={`/ti/ativos/${a.id}`} className="font-medium text-fct-tinta hover:underline">
                            {TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo}
                          </Link>
                        ) : (
                          <span className="font-medium">{TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">{a.descricao}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{a.patrimonio ?? a.numero_serie ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{a.filial?.codigo ?? "—"}</TableCell>
                      <TableCell className="text-xs">{STATUS_ATIVO_LABEL[a.status]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Usuário do sistema</h2>
            {ficha.usuario ? (
              <dl className="grid gap-3">
                <Dado rotulo="Login" valor={ficha.usuario.email} />
                <Dado rotulo="Papel" valor={ehPapel(ficha.usuario.papel) ? PAPEL_LABEL[ficha.usuario.papel] : ficha.usuario.papel} />
                <Dado rotulo="Situação" valor={ficha.usuario.ativo ? "Ativo" : "Desativado"} />
                <Dado rotulo="Último acesso" valor={ficha.usuario.ultimo_acesso ? formatarDataHora(ficha.usuario.ultimo_acesso) : "nunca"} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Sem usuário ligado a este cadastro. Para ligar: Administração → Usuários → editar → “Cadastro de funcionário”.</p>
            )}
            {ficha.usuario && sessao.papel === "admin" && (
              <Link href={`/configuracoes/usuarios/${ficha.usuario.id}/editar`} className="mt-3 inline-block text-sm text-fct-tinta underline">
                Editar usuário
              </Link>
            )}
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Acesso a outro sistema (Trier, e-mail…)?{" "}
              <Link href="/ti/acessos/novo" className="text-fct-tinta underline">
                Solicitar ou revogar pela TI
              </Link>
              .
            </p>
          </section>
        </div>
      )}

      {aba === "historico" && podeEditar && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Linha do tempo</h2>
          {linhaDoTempo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
          ) : (
            <ol className="space-y-3 border-l pl-5">
              {linhaDoTempo.map((e, i) => (
                <li key={`${e.quando}-${i}`} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-fct-tinta/60" aria-hidden />
                  <p className="text-xs text-muted-foreground">{e.quando.length > 10 ? formatarDataHora(e.quando) : formatarData(e.quando)}</p>
                  <p className="text-sm font-medium">{e.titulo}</p>
                  {e.detalhe && <p className="text-xs text-muted-foreground">{e.detalhe}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
