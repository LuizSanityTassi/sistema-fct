import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeAtivo, BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarFuncionariosDaFilial, obterFilial } from "@/lib/data/filiais";
import { formatarData, pluralizar } from "@/lib/formatos";
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

export default async function FilialPage({ params, searchParams }: PageProps<"/filiais/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/filiais"), params, searchParams]);
  const filial = await obterFilial(id);
  if (!filial) notFound();
  const funcionarios = await listarFuncionariosDaFilial(id);
  const admin = sessao.papel === "admin";
  const podeVerFuncionarios = ["admin", "rh", "gerente"].includes(sessao.papel);

  const grupo = filial.organizations?.nome_fantasia ?? filial.organizations?.razao_social ?? "";
  const responsavel = filial.responsavel?.nome ?? filial.responsavel_nome ?? null;

  return (
    <>
      <PageHeader
        eyebrow={[grupo, filial.regional].filter(Boolean).join(" · ")}
        titulo={`${filial.codigo} — ${filial.nome}`}
        descricao={filial.razao_social ?? undefined}
        acoes={
          admin ? (
            <>
              <Button variant="outline" render={<Link href={`/filiais/${filial.id}/editar`} />}>
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
          </dl>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Responsável</h2>
          {responsavel ? (
            <>
              <p className="font-medium">{responsavel}</p>
              <p className="text-sm text-muted-foreground">
                {filial.responsavel ? (filial.responsavel.cargo ?? "Funcionário cadastrado") : "Não vinculado a um funcionário da folha"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum responsável definido.</p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">
            Funcionários {podeVerFuncionarios && `(${pluralizar(funcionarios.length, "pessoa", "pessoas")})`}
          </h2>
        </div>
        {!podeVerFuncionarios ? (
          <p className="border-t px-5 py-6 text-sm text-muted-foreground">Seu perfil não tem acesso à lista de funcionários.</p>
        ) : funcionarios.length === 0 ? (
          <p className="border-t px-5 py-6 text-sm text-muted-foreground">Nenhum funcionário cadastrado nesta unidade.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden sm:table-cell">Admissão</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funcionarios.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.matricula ?? "—"}</TableCell>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="hidden md:table-cell">{f.cargo ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatarData(f.data_admissao)}</TableCell>
                  <TableCell>
                    <BadgeStatusFuncionario status={f.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
