import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { listarRegionais } from "@/lib/data/filiais";
import { obterUsuario } from "@/lib/data/usuarios";
import { funcionariosDoCaixa } from "@/lib/data/diferenca-caixa";
import { formatarDataHora } from "@/lib/formatos";
import { salvarUsuario } from "../../actions";
import { UsuarioForm } from "../../usuario-form";

export const metadata = { title: "Editar usuário" };

export default async function EditarUsuarioPage({ params }: PageProps<"/configuracoes/usuarios/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/configuracoes/usuarios"), params]);
  if (sessao.papel !== "admin") semAcesso("/configuracoes/usuarios");
  const [usuario, unidades, funcionarios, regionais] = await Promise.all([obterUsuario(id), listarUnidadesParaSelecao(), funcionariosDoCaixa(), listarRegionais()]);
  if (!usuario) notFound();
  const opcoesFuncionario = funcionarios
    .filter((f) => f.status !== "desligado" || f.id === usuario.employee_id)
    .map((f) => ({ id: f.id, rotulo: `${f.nome} — ${f.filial}${f.matricula ? ` · mat. ${f.matricula}` : ""}${f.cargo ? ` · ${f.cargo}` : ""}` }));

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        titulo={usuario.nome || usuario.email || "Usuário"}
        descricao={`Criado em ${formatarDataHora(usuario.created_at)} · último acesso ${usuario.ultimo_acesso ? formatarDataHora(usuario.ultimo_acesso) : "nunca"}`}
      />
      <UsuarioForm
        action={salvarUsuario.bind(null, usuario.id)}
        unidades={unidades}
        regionais={regionais}
        modo="edicao"
        valores={{
          email: usuario.email,
          nome: usuario.nome,
          papel: usuario.papel,
          branch_id: usuario.branch_id,
          ativo: usuario.ativo,
          filiaisAdicionais: usuario.filiaisAdicionais,
          respondeDenuncias: usuario.respondeDenuncias,
          employee_id: usuario.employee_id,
          regional: usuario.regional,
        }}
        funcionarios={opcoesFuncionario}
        ehProprioUsuario={usuario.id === sessao.id}
      />
    </>
  );
}
