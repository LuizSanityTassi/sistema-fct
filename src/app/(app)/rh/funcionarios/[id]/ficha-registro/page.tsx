import { notFound, redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/auth/session";
import { carregarEmpresaDaFilial } from "@/lib/data/documentos";
import { listarSalarios, obterFuncionario } from "@/lib/data/funcionarios";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { BarraImpressao } from "../../../_ui/barra-impressao";
import { FichaRegistro } from "../../../_ui/documentos-impressos";

export const metadata = { title: "Ficha de registro" };

export default async function FichaRegistroPage({ params }: PageProps<"/rh/funcionarios/[id]/ficha-registro">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/rh/funcionarios"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect(`/rh/funcionarios/${id}`);
  const f = await obterFuncionario(id);
  if (!f) notFound();
  const [empresa, salarios] = await Promise.all([carregarEmpresaDaFilial(f.branch_id), listarSalarios(id)]);
  const vigente = salarios.find((s) => !s.vigencia_fim) ?? salarios[0];
  const razao = empresa?.razao_social ?? empresa?.organizations?.razao_social ?? "";
  const cnpj = empresa?.cnpj ?? empresa?.organizations?.cnpj ?? "";
  const t = (v: string | null | undefined) => v ?? "";
  const dt = (v: string | null | undefined) => (v ? formatarData(v) : "");

  const obrigatorios: [string, unknown][] = [["admissão", f.data_admissao], ["cargo", f.cargo], ["salário", vigente], ["horário de trabalho", f.horario_trabalho], ["período de experiência", f.periodo_experiencia], ["PIS", f.pis], ["nascimento", f.data_nascimento], ["nome da mãe", f.nome_mae], ["endereço", f.endereco], ["cidade", f.cidade], ["CPF", f.cpf], ["RG", f.rg]];

  return (
    <>
      <BarraImpressao voltar={`/rh/funcionarios/${id}?aba=documentos`} editar={`/rh/funcionarios/${id}/editar`} faltam={obrigatorios.filter(([, v]) => !v).map(([n]) => n)} />
      <FichaRegistro
        d={{
          empresa: [razao, cnpj].filter(Boolean).join(" - "),
          nome: f.nome,
          admissao: dt(f.data_admissao),
          cargo: t(f.cargo),
          salario: vigente ? formatarMoeda(vigente.salario) : "",
          adicionais: t(f.adicionais),
          horario: t(f.horario_trabalho),
          experiencia: t(f.periodo_experiencia),
          pis: t(f.pis),
          nascimento: dt(f.data_nascimento),
          mae: t(f.nome_mae),
          pai: t(f.nome_pai),
          endereco: t(f.endereco),
          bairro: t(f.bairro),
          cidade: t(f.cidade),
          cep: t(f.cep),
          numero: t(f.endereco_numero),
          uf: t(f.uf),
          celular: t(f.celular),
          telefone: t(f.telefone),
          email: t(f.email),
          escolaridade: t(f.escolaridade),
          estadoCivil: t(f.estado_civil),
          rg: t(f.rg),
          rgEmissao: dt(f.rg_emissao),
          rgEmissor: t(f.rg_emissor),
          rgUf: t(f.rg_uf),
          cpf: t(f.cpf),
          raca: t(f.raca_cor),
          titulo: t(f.titulo_eleitor),
          zona: t(f.titulo_zona),
          secao: t(f.titulo_secao),
          cnh: t(f.cnh),
          cnhEmissao: dt(f.cnh_emissao),
          cnhVencimento: dt(f.cnh_vencimento),
          cnhCategoria: t(f.cnh_categoria),
          reservista: t(f.reservista),
          reservistaCategoria: t(f.reservista_categoria),
          geradoEm: formatarDataHora(new Date().toISOString()),
        }}
      />
    </>
  );
}
