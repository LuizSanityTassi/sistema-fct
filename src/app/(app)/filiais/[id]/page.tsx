import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, Laptop, LifeBuoy, Pencil, Scale, Users, Wallet } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeAtivo, BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { COR_SITUACAO, ROTULO_CURTO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { CATEGORIA_CHAMADO_LABEL, PRIORIDADE_LABEL, STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";
import { carregarFicha360Filial } from "@/lib/data/ficha-filial";
import { obterFilial } from "@/lib/data/filiais";
import { podeAcessar } from "@/lib/nav";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { alterarStatusFilial } from "../actions";

export async function generateMetadata({ params }: PageProps<"/filiais/[id]">): Promise<Metadata> {
  const { id } = await params;
  const filial = await obterFilial(id);
  return { title: filial ? `${filial.codigo} · ${filial.nome}` : "Unidade" };
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{valor || "—"}</dd>
    </div>
  );
}

type Aba = "geral" | "pessoas" | "financeiro" | "caixa" | "folha" | "ti";

const variacao = (atual: number, anterior: number | undefined) => {
  if (anterior === undefined || anterior === 0) return null;
  const p = ((atual - anterior) / Math.abs(anterior)) * 100;
  return `${p >= 0 ? "↑" : "↓"} ${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
};
const fmtValor = (v: number, unidade: string) => (unidade === "horas" ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h` : formatarMoeda(v));

export default async function FilialPage({ params, searchParams }: PageProps<"/filiais/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/filiais"), params, searchParams]);
  const filial = await obterFilial(id);
  if (!filial) notFound();
  const d = await carregarFicha360Filial(id, sessao.papel);
  const admin = sessao.papel === "admin";

  const abas: { chave: Aba; rotulo: string }[] = [
    { chave: "geral", rotulo: "Visão geral" },
    ...(d.ve.pessoas ? [{ chave: "pessoas" as const, rotulo: "Pessoas" }] : []),
    ...(d.ve.financeiro ? [{ chave: "financeiro" as const, rotulo: "Financeiro" }] : []),
    ...(d.ve.caixa ? [{ chave: "caixa" as const, rotulo: "Caixa" }] : []),
    ...(d.ve.folha ? [{ chave: "folha" as const, rotulo: "Folha" }] : []),
    { chave: "ti", rotulo: "TI e chamados" },
  ];
  const aba: Aba = abas.some((a) => a.chave === sp.aba) ? (sp.aba as Aba) : "geral";
  const linkAba = (a: Aba) => `/filiais/${filial.id}?aba=${a}`;

  const grupo = filial.organizations?.nome_fantasia ?? filial.organizations?.razao_social ?? "";
  const responsavel = filial.responsavel?.nome ?? filial.responsavel_nome ?? null;
  const ultimo = d.ultimoMes;
  const anterior = d.financeiro[1];
  const raiz = (filial.cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  const filialTrier = /^F(\d+)$/i.test(filial.codigo) ? Number(filial.codigo.slice(1)) : null;

  const resumo: { rotulo: string; valor: string; nota?: string; href: string; icone: typeof Users; tom?: string }[] = [
    ...(d.ve.pessoas
      ? [{ rotulo: "Funcionários", valor: String(d.pessoas.porStatus.ativo + d.pessoas.porStatus.afastado + d.pessoas.porStatus.ferias), nota: d.pessoas.aso.vencidos ? `${d.pessoas.aso.vencidos} ASO vencido(s)` : undefined, href: linkAba("pessoas"), icone: Users, tom: d.pessoas.aso.vencidos ? "text-red-700" : "" }]
      : []),
    ...(d.ve.financeiro && ultimo
      ? [{ rotulo: `Resultado · ${rotuloCompetencia(ultimo.competencia)}`, valor: formatarMoeda(ultimo.resultado), nota: variacao(ultimo.resultado, anterior?.resultado) ? `${variacao(ultimo.resultado, anterior?.resultado)} vs mês anterior` : undefined, href: linkAba("financeiro"), icone: Wallet, tom: ultimo.resultado < 0 ? "text-red-700" : "text-emerald-700" }]
      : []),
    ...(d.ve.caixa ? [{ rotulo: "Quebras (30 dias)", valor: `${d.caixa.quebras}`, nota: d.caixa.abertas ? `${d.caixa.abertas} em aberto` : "nenhuma em aberto", href: linkAba("caixa"), icone: Coins, tom: d.caixa.abertas ? "text-orange-700" : "" }] : []),
    ...(d.ve.conciliacao ? [{ rotulo: "Conciliação", valor: `${d.conciliacao.abertas} pendência(s)`, nota: d.conciliacao.vencidas ? `${d.conciliacao.vencidas} vencida(s)` : undefined, href: linkAba("financeiro"), icone: Scale, tom: d.conciliacao.vencidas ? "text-red-700" : "" }] : []),
    { rotulo: "Equipamentos", valor: String(d.ativos.length), href: linkAba("ti"), icone: Laptop, tom: d.ativos.length ? "" : "text-muted-foreground" },
    { rotulo: "Chamados abertos", valor: String(d.chamados.length), nota: d.chamados.some((c) => c.prioridade === "critica") ? "tem chamado crítico" : undefined, href: linkAba("ti"), icone: LifeBuoy, tom: d.chamados.some((c) => c.prioridade === "critica") ? "text-red-700" : "" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={[grupo, filial.regional].filter(Boolean).join(" · ")}
        titulo={`${filial.codigo} — ${filial.nome}`}
        descricao={[filial.razao_social, filial.cnpj].filter(Boolean).join(" · ") || undefined}
        acoes={
          admin ? (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href={`/filiais/${filial.id}/editar`} />}>
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
              <ConfirmarAcao
                titulo={filial.ativo ? "Inativar unidade?" : "Reativar unidade?"}
                descricao={
                  filial.ativo
                    ? `${filial.codigo} — ${filial.nome} deixa de aparecer nas listas e seleções. Nada é apagado: funcionários e histórico continuam vinculados.`
                    : `${filial.codigo} — ${filial.nome} volta a aparecer nas listas e seleções.`
                }
                rotuloBotao={filial.ativo ? "Inativar" : "Reativar"}
                variant={filial.ativo ? "destructive" : "outline"}
                action={alterarStatusFilial}
                campos={{ id: filial.id, ativo: String(!filial.ativo) }}
              />
            </>
          ) : undefined
        }
      />

      {sp.salvo === "1" && (
        <div className="mb-6">
          <AvisoSucesso mensagem="Unidade salva com sucesso." />
        </div>
      )}

      <nav aria-label="Seções da unidade" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={linkAba(a.chave)}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${aba === a.chave ? "border-fct-navy font-semibold text-fct-navy" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "geral" && (
        <>
          <section aria-label="Resumo" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {resumo.map((r) => (
              <Link key={r.rotulo} href={r.href} className="rounded-xl border bg-card px-4 py-3 transition-colors hover:border-fct-navy/40">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <r.icone className="size-3.5" aria-hidden />
                  {r.rotulo}
                </span>
                <span className={`mt-1 block text-lg font-semibold tabular-nums ${r.tom ?? ""}`}>{r.valor}</span>
                {r.nota && <span className="block text-xs text-muted-foreground">{r.nota}</span>}
              </Link>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border bg-card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Dados da unidade</h2>
                <BadgeAtivo ativo={filial.ativo} />
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dado rotulo="Grupo" valor={grupo} />
                <Dado rotulo="Regional" valor={filial.regional} />
                <Dado rotulo="Razão social" valor={filial.razao_social} />
                <Dado rotulo="CNPJ" valor={filial.cnpj} mono />
                <Dado rotulo="Cidade / UF" valor={[filial.cidade, filial.estado].filter(Boolean).join(" / ")} />
                <Dado rotulo="Endereço" valor={filial.endereco} />
                <Dado rotulo="Telefone" valor={filial.telefone} />
                <Dado rotulo="E-mail" valor={filial.email} />
                {filialTrier !== null && <Dado rotulo="Loja no Trier" valor={String(filialTrier)} mono />}
                {d.folha && <Dado rotulo="Código na Domínio" valor={d.folha.codigoDominio ? String(d.folha.codigoDominio) : "não informado"} mono />}
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Gestão</h2>
              <dl className="grid gap-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Responsável</dt>
                  <dd className="mt-0.5 text-sm">
                    {responsavel ?? "—"}
                    {responsavel && <span className="block text-xs text-muted-foreground">{filial.responsavel ? (filial.responsavel.cargo ?? "Funcionário cadastrado") : "Não vinculado a um funcionário da folha"}</span>}
                  </dd>
                </div>
                {d.leGestao && <Dado rotulo="Gerentes com acesso" valor={d.gerentes.length ? d.gerentes.join(", ") : "nenhum usuário gerente nesta loja"} />}
                {d.ve.caixaTudo && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Gestor das quebras de caixa</dt>
                    <dd className="mt-0.5 text-sm">
                      {d.gestorNome ?? <span className="text-amber-800">não definido</span>}{" "}
                      <Link href="/financeiro/diferenca-caixa/gestores" className="text-xs text-fct-navy underline">
                        trocar
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>
        </>
      )}

      {aba === "pessoas" && d.ve.pessoas && (
        <section className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <h2 className="text-sm font-semibold">
              Funcionários ({pluralizar(d.pessoas.lista.length, "pessoa", "pessoas")}) · {d.pessoas.porStatus.ativo} ativos{d.pessoas.porStatus.afastado ? ` · ${d.pessoas.porStatus.afastado} afastados` : ""}
              {d.pessoas.porStatus.ferias ? ` · ${d.pessoas.porStatus.ferias} em férias` : ""}
            </h2>
            <span className="text-xs text-muted-foreground">
              ASO: {d.pessoas.aso.vencidos} vencido(s) · {d.pessoas.aso.vencendo} vencendo · {d.pessoas.aso.sem} sem ASO
            </span>
          </div>
          {d.pessoas.lista.length === 0 ? (
            <p className="border-t px-5 py-6 text-sm text-muted-foreground">Nenhum funcionário cadastrado nesta unidade.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">Cargo</TableHead>
                  <TableHead className="hidden sm:table-cell">Admissão</TableHead>
                  <TableHead className="hidden sm:table-cell">ASO</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.pessoas.lista.map((f) => {
                  const s = f.status === "desligado" ? null : d.pessoas.situacaoAso(f.id);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.matricula ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rh/funcionarios/${f.id}`} className="hover:underline">
                          {f.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{f.cargo ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{formatarData(f.data_admissao)}</TableCell>
                      <TableCell className={`hidden text-xs sm:table-cell ${s === "vencido" ? "text-red-700" : s === "vencendo" ? "text-amber-700" : "text-muted-foreground"}`}>
                        {s === null ? "—" : s === "vencido" ? "vencido" : s === "vencendo" ? "vence em 30 dias" : s === "sem" ? "sem ASO" : "válido"}
                      </TableCell>
                      <TableCell>
                        <BadgeStatusFuncionario status={f.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}

      {aba === "financeiro" && d.ve.financeiro && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card lg:col-span-2">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-sm font-semibold">Receitas × despesas (realizado)</h2>
              {podeAcessar(sessao.papel, "/financeiro/lancamentos") && (
                <Link href={`/financeiro/lancamentos?filial=${filial.id}`} className="text-xs text-fct-navy underline">
                  Ver lançamentos
                </Link>
              )}
            </div>
            {d.financeiro.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum lançamento financeiro desta unidade.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">vs mês anterior</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.financeiro.map((m, i) => (
                    <TableRow key={m.competencia}>
                      <TableCell>{rotuloCompetencia(m.competencia)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(m.receitas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(m.despesas)}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${m.resultado < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatarMoeda(m.resultado)}</TableCell>
                      <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{variacao(m.resultado, d.financeiro[i + 1]?.resultado) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <div className="space-y-4">
            {ultimo && d.topDespesas.length > 0 && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-2 text-sm font-semibold">Maiores despesas · {rotuloCompetencia(ultimo.competencia)}</h2>
                <ul className="space-y-1.5 text-sm">
                  {d.topDespesas.map(([nome, v]) => (
                    <li key={nome} className="flex justify-between gap-2">
                      <span className="truncate">{nome}</span>
                      <span className="tabular-nums">{formatarMoeda(v)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {d.ve.conciliacao && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-1 text-sm font-semibold">Conciliação</h2>
                {d.conciliacao.abertas === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pendência em aberto.</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm">
                      {d.conciliacao.abertas} pendência(s) · {formatarMoeda(d.conciliacao.valor)}
                      {d.conciliacao.vencidas > 0 && <span className="text-red-700"> · {d.conciliacao.vencidas} vencida(s)</span>}
                    </p>
                    <ul className="divide-y text-xs">
                      {d.conciliacao.proximas.map((p) => (
                        <li key={p.chave} className="flex justify-between gap-2 py-1.5">
                          <span className="min-w-0 truncate">{p.beneficiario ?? p.problema}</span>
                          <span className={`shrink-0 tabular-nums ${p.vencimento && p.vencimento < d.hoje ? "text-red-700" : "text-muted-foreground"}`}>{formatarData(p.vencimento)}</span>
                        </li>
                      ))}
                    </ul>
                    {filialTrier !== null && (
                      <Link href={`/conciliacao/pendencias?filial=${filialTrier}&ordem=vencimento`} className="mt-2 inline-block text-xs text-fct-navy underline">
                        Abrir pendências da loja
                      </Link>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {aba === "caixa" && d.ve.caixa && (
        <>
          <section aria-label="Caixa nos últimos 30 dias" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ...(d.caixa.caixas !== null ? [{ r: "Caixas lidos (30 dias)", v: String(d.caixa.caixas) }] : []),
              { r: "Quebras", v: String(d.caixa.quebras) },
              { r: "Faltas (descontadas)", v: formatarMoeda(d.caixa.faltas) },
              { r: "Sobras (descontadas)", v: formatarMoeda(d.caixa.sobras) },
            ].map((k) => (
              <div key={k.r} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{k.r}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{k.v}</p>
              </div>
            ))}
          </section>
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-sm font-semibold">Últimas quebras</h2>
              {d.ve.caixaTudo && (
                <Link href={`/financeiro/diferenca-caixa?filial=${filial.id}`} className="text-xs text-fct-navy underline">
                  Ver na Diferença de caixa
                </Link>
              )}
            </div>
            {d.caixa.ultimas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nenhuma quebra de caixa nos últimos 30 dias.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Caixa</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.caixa.ultimas.map((q) => {
                    const st = situacaoDoCaixa(q.classe, q.andamento);
                    const dif = Number(q.diferenca);
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="whitespace-nowrap">{formatarData(q.dia)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {d.ve.caixaTudo ? (
                            <Link href={`/financeiro/diferenca-caixa/${q.id}`} className="text-fct-navy hover:underline">
                              {q.origem === "manual" ? "manual" : q.numero_caixa}
                            </Link>
                          ) : q.origem === "manual" ? (
                            "manual"
                          ) : (
                            q.numero_caixa
                          )}
                        </TableCell>
                        <TableCell>{q.nome_operador}</TableCell>
                        <TableCell className={`text-right font-medium whitespace-nowrap tabular-nums ${dif > 0 ? "text-red-700" : "text-sky-700"}`}>{textoDiferenca(dif)}</TableCell>
                        <TableCell>
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${COR_SITUACAO[st]}`}>{ROTULO_CURTO[st]}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}

      {aba === "folha" && d.folha && (
        <div className="grid gap-4 md:grid-cols-2">
          {[d.folha.atual, d.folha.anterior].map((m) => (
            <section key={m.competencia} className="rounded-xl border bg-card p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Lançamentos · {rotuloCompetencia(m.competencia)}</h2>
                <Link href={`/rh/lancamentos?${new URLSearchParams({ competencia: m.competencia, ...(raiz ? { empresa: raiz, filial: filial.id } : {}) })}`} className="text-xs text-fct-navy underline">
                  Abrir na folha
                </Link>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{m.funcionarios} funcionário(s) com lançamento</p>
              {m.eventos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {m.eventos.map((e) => (
                    <li key={e.nome} className="flex justify-between gap-2">
                      <span>{e.nome}</span>
                      <span className="tabular-nums">{fmtValor(e.total, e.unidade)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {filial.cnpj && (
                <a href={`/api/folha-lancamentos/planilha?competencia=${m.competencia}&filial=${filial.id}`} className="mt-3 inline-block text-xs font-medium text-fct-navy underline">
                  Baixar a planilha da contabilidade
                </a>
              )}
            </section>
          ))}
        </div>
      )}

      {aba === "ti" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-sm font-semibold">Equipamentos ({d.ativos.length})</h2>
              {podeAcessar(sessao.papel, "/ti/ativos") && (
                <Link href={`/ti/ativos?filial=${filial.id}`} className="text-xs text-fct-navy underline">
                  Abrir inventário
                </Link>
              )}
            </div>
            {d.ativos.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum equipamento cadastrado nesta loja.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.ativos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <span className="font-medium">{TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {a.descricao}
                          {a.patrimonio ? ` · ${a.patrimonio}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{(a.responsavel as { nome: string } | null)?.nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">{STATUS_ATIVO_LABEL[a.status]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-sm font-semibold">Chamados abertos ({d.chamados.length})</h2>
              <Link href={`/chamados?filial=${filial.id}`} className="text-xs text-fct-navy underline">
                Ver chamados
              </Link>
            </div>
            {d.chamados.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum chamado aberto desta loja.</p>
            ) : (
              <ul className="divide-y">
                {d.chamados.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">#{c.numero}</span>
                    <Link href={`/chamados/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {c.titulo}
                    </Link>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{CATEGORIA_CHAMADO_LABEL[c.categoria]}</span>
                    <span className={`text-xs ${c.prioridade === "critica" ? "font-semibold text-red-700" : c.prioridade === "alta" ? "text-orange-700" : "text-muted-foreground"}`}>{PRIORIDADE_LABEL[c.prioridade]}</span>
                    <span className="hidden text-xs text-muted-foreground md:inline">{STATUS_CHAMADO_LABEL[c.status]}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t px-5 py-3">
              <Link href={`/chamados/novo?filial=${filial.id}`} className="text-xs font-medium text-fct-navy underline">
                Abrir chamado para esta loja
              </Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
