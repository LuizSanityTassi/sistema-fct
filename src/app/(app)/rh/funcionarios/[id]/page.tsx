import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Pencil, Stethoscope } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarSalarios, obterFuncionario } from "@/lib/data/funcionarios";
import { CONTRATO_LABEL } from "@/lib/rh/rotulos";
import { anosDesde, descreverPeriodo, formatarData, formatarMoeda } from "@/lib/formatos";
import { mascararCpf } from "@/lib/validacao/cpf";
import { alterarStatusFuncionario } from "../actions";
import { AlterarStatusFuncionario } from "../alterar-status";
import { DocumentosEAso } from "./documentos-aso";

export async function generateMetadata({ params }: PageProps<"/rh/funcionarios/[id]">): Promise<Metadata> {
  const { id } = await params;
  const f = await obterFuncionario(id);
  return { title: f ? f.nome : "Funcionário" };
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor?: string | number | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{valor === null || valor === undefined || valor === "" ? "—" : valor}</dd>
    </div>
  );
}

export default async function FuncionarioPage({ params, searchParams }: PageProps<"/rh/funcionarios/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/rh/funcionarios"), params, searchParams]);
  const f = await obterFuncionario(id);
  if (!f) notFound();
  const podeEditar = sessao.papel === "admin" || sessao.papel === "rh";
  const salarios = podeEditar ? await listarSalarios(id) : [];
  const vigente = salarios.find((s) => !s.vigencia_fim) ?? salarios[0];

  const unidade = f.unidade;
  const grupo = unidade?.organizations?.nome_fantasia ?? "";
  const idade = anosDesde(f.data_nascimento);
  const tempoCasa = f.status === "desligado" ? null : descreverPeriodo(f.data_admissao);

  return (
    <>
      <PageHeader
        eyebrow={[unidade ? `${unidade.codigo} · ${unidade.nome}` : null, grupo].filter(Boolean).join(" · ")}
        titulo={f.nome}
        descricao={[f.cargo, f.matricula ? `matrícula ${f.matricula}` : null].filter(Boolean).join(" · ") || undefined}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Situação</h2>
            <BadgeStatusFuncionario status={f.status} />
          </div>
          <dl className="grid gap-4">
            <Dado rotulo="Admissão" valor={f.data_admissao ? `${formatarData(f.data_admissao)}${tempoCasa ? ` · ${tempoCasa}` : ""}` : null} />
            {f.status === "desligado" && <Dado rotulo="Desligamento" valor={formatarData(f.data_desligamento)} />}
            <Dado
              rotulo="Unidade"
              valor={unidade ? `${unidade.codigo} — ${unidade.nome}${unidade.regional ? ` (${unidade.regional})` : ""}` : null}
            />
            <Dado rotulo="Departamento" valor={f.departamento?.nome} />
          </dl>
          {unidade && (
            <Link href={`/filiais/${unidade.id}`} className="mt-4 inline-block text-sm text-fct-navy underline">
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

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold">Remuneração</h2>
          {!podeEditar ? (
            <p className="text-sm text-muted-foreground">Acesso restrito a Administrador e RH.</p>
          ) : salarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum salário registrado.</p>
          ) : (
            <>
              <p className="mb-4 text-2xl font-semibold tabular-nums">
                {formatarMoeda(vigente?.salario)} <span className="text-sm font-normal text-muted-foreground">/ mês</span>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vigência</TableHead>
                    <TableHead className="text-right">Salário</TableHead>
                    <TableHead className="hidden sm:table-cell">Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salarios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {formatarData(s.vigencia_inicio)} → {s.vigencia_fim ? formatarData(s.vigencia_fim) : "atual"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(s.salario)}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{s.origem ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Arquivos da ficha</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="#documentos" className="flex items-center gap-2 text-fct-navy hover:underline">
                <FileText className="size-4" aria-hidden /> Documentos
              </a>
            </li>
            <li>
              <a href="#aso" className="flex items-center gap-2 text-fct-navy hover:underline">
                <Stethoscope className="size-4" aria-hidden /> Exames ocupacionais (ASO)
              </a>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Arquivos ficam em armazenamento privado; o download usa link temporário de 60 segundos.
          </p>
        </section>
      </div>

      {f.observacoes && (
        <section className="mt-4 rounded-xl border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold">Observações</h2>
          <p className="text-sm whitespace-pre-line">{f.observacoes}</p>
        </section>
      )}

      <DocumentosEAso employeeId={f.id} podeEditar={podeEditar} />
    </>
  );
}
