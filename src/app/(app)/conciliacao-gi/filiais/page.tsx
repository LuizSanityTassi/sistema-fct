import Link from "next/link";
import { Building2, Pencil } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeAtivo } from "@/components/layout/badge-status";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { codigoFilialGi, listarFiliaisGi } from "@/lib/data/conciliacao-gi";
import { formatarDataHora } from "@/lib/formatos";
import { formatarCnpj } from "@/lib/validacao/cnpj";
import { excluirFilialGi, salvarFilialGi } from "./actions";
import { FilialGiForm } from "./filial-form";

export const metadata = { title: "Filiais da GI" };

/** Filiais da GI: o "cadastro de unidades" só da Conciliação GI (a GI não está nas unidades do sistema). */
export default async function FiliaisGiPage({ searchParams }: PageProps<"/conciliacao-gi/filiais">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao-gi/filiais"), searchParams]);
  const filiais = await listarFiliaisGi();
  const escreve = podeConciliar(sessao.papel);
  const editando = typeof sp.editar === "string" ? filiais.find((f) => String(f.codigo) === sp.editar) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Conciliação GI"
        titulo="Filiais da GI"
        descricao="O número de cada filial no Trier da GI, com nome e CNPJ. É por aqui que a conciliação liga cada boleto (pelo CNPJ do pagador) e cada título (pelo número da filial) à filial certa. Não mexe nas unidades do sistema."
      />

      {sp.ok === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Salvo." />
        </div>
      )}

      {escreve && (
        <section className="mb-4 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">{editando ? `Alterar a filial ${codigoFilialGi(editando.codigo)} ${editando.nome}` : "Cadastrar filial"}</h2>
          <FilialGiForm
            key={editando?.codigo ?? "nova"}
            action={salvarFilialGi}
            valores={editando ? { codigo: editando.codigo, nome: editando.nome, cnpj: editando.cnpj ? formatarCnpj(editando.cnpj) : null, departamento_omie: editando.departamento_omie, ativo: editando.ativo } : undefined}
          />
        </section>
      )}

      <section className="rounded-xl border bg-card">
        {filiais.length === 0 ? (
          <EstadoVazio icone={Building2} titulo="Nenhuma filial da GI cadastrada" descricao="Cadastre o número de cada filial no Trier da GI, com nome e CNPJ, antes da primeira conciliação." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Filial</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                <TableHead className="hidden lg:table-cell">Departamento na Omie</TableHead>
                <TableHead className="hidden w-24 sm:table-cell">Situação</TableHead>
                <TableHead className="hidden xl:table-cell">Alterada</TableHead>
                {escreve && <TableHead className="w-40" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filiais.map((f) => (
                <TableRow key={f.codigo}>
                  <TableCell className="font-mono text-xs text-fct-tinta">{codigoFilialGi(f.codigo)}</TableCell>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{f.cnpj ? formatarCnpj(f.cnpj) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">{f.departamento_omie ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <BadgeAtivo ativo={f.ativo} />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                    {formatarDataHora(f.atualizado_em)}
                    {f.quem?.nome ? ` · ${f.quem.nome}` : ""}
                  </TableCell>
                  {escreve && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="icon-sm" nativeButton={false} aria-label={`Alterar ${f.nome}`} render={<Link href={`/conciliacao-gi/filiais?editar=${f.codigo}`} scroll={false} />}>
                          <Pencil />
                        </Button>
                        <ConfirmarAcao
                          titulo={`Excluir a filial ${codigoFilialGi(f.codigo)} ${f.nome}?`}
                          descricao="As conciliações já feitas continuam como estão; nas próximas, boletos e títulos dessa filial ficam sem nome de filial."
                          rotuloBotao="Excluir"
                          rotuloConfirmar="Excluir"
                          variant="destructive"
                          action={excluirFilialGi}
                          campos={{ codigo: String(f.codigo) }}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
