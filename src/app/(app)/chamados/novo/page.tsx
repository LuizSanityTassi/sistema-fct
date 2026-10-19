import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { abrirChamado } from "../actions";
import { ChamadoForm } from "../chamado-form";

export const metadata = { title: "Novo chamado" };

export default async function NovoChamadoPage({ searchParams }: PageProps<"/chamados/novo">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/chamados"), searchParams]);
  const unidades = await listarUnidadesParaSelecao();
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].slice(0, 120) : undefined);
  const filial = s("filial");

  return (
    <>
      <PageHeader
        eyebrow="Chamados"
        titulo="Novo chamado"
        descricao="Descreva o que precisa. O chamado recebe um número e você acompanha cada atualização por aqui."
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Precisa de acesso a um sistema?{" "}
        <Link href="/ti/acessos/novo" className="text-fct-tinta underline">
          Use o formulário de solicitação de acesso
        </Link>
        .
      </p>
      <ChamadoForm
        action={abrirChamado}
        unidades={unidades.filter((u) => u.ativo || u.id === sessao.branchId || u.id === filial)}
        unidadePadrao={filial && unidades.some((u) => u.id === filial) ? filial : sessao.branchId}
        inicial={{ titulo: s("titulo"), categoria: s("categoria"), tipo: s("tipo") }}
      />
    </>
  );
}
