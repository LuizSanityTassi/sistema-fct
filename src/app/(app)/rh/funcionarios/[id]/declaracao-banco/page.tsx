import { notFound, redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/auth/session";
import { carregarAssinaturaDoSocio, carregarEmpresaDaFilial } from "@/lib/data/documentos";
import { obterFuncionario } from "@/lib/data/funcionarios";
import { BarraImpressao } from "../../../_ui/barra-impressao";
import { DeclaracaoBanco } from "../../../_ui/documentos-impressos";

export const metadata = { title: "Declaração do banco" };

function dataPorExtenso(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")} de ${p("month").toUpperCase()} de ${p("year")}`;
}

export default async function DeclaracaoBancoPage({ params }: PageProps<"/rh/funcionarios/[id]/declaracao-banco">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/rh/funcionarios"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect(`/rh/funcionarios/${id}`);
  const f = await obterFuncionario(id);
  if (!f) notFound();
  const org = (await carregarEmpresaDaFilial(f.branch_id))?.organizations ?? null;
  const assinatura = org ? await carregarAssinaturaDoSocio(org.id) : null;
  const obrigatorios: [string, unknown][] = [["CPF", f.cpf], ["cidade", f.cidade], ["UF", f.uf], ["dados do sócio da empresa (fale com o administrador)", org?.socio_nome && org.socio_cpf && org.endereco_declaracao]];

  return (
    <>
      <BarraImpressao voltar={`/rh/funcionarios/${id}?aba=documentos`} editar={`/rh/funcionarios/${id}/editar`} faltam={obrigatorios.filter(([, v]) => !v).map(([n]) => n)} />
      <DeclaracaoBanco
        d={{
          socioNome: org?.socio_nome ?? "",
          socioCpf: org?.socio_cpf ?? "",
          razaoSocial: org?.razao_declaracao ?? org?.razao_social ?? "",
          cnpj: org?.cnpj ?? "",
          enderecoEmpresa: org?.endereco_declaracao ?? "",
          funcionario: f.nome,
          cpf: f.cpf ?? "",
          cidade: f.cidade ?? "",
          uf: f.uf ?? "",
          data: dataPorExtenso(),
          assinatura,
        }}
      />
    </>
  );
}
