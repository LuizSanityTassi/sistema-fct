import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { obterUsuario } from "@/lib/data/usuarios";
import { formatarDataHora } from "@/lib/formatos";
import { salvarUsuario } from "../../actions";
import { UsuarioForm } from "../../usuario-form";

export const metadata = { title: "Editar usuário" };

export default async function EditarUsuarioPage({ params }: PageProps<"/configuracoes/usuarios/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/configuracoes/usuarios"), params]);
  if (sessao.papel !== "admin") redirect("/dashboard?erro=sem_permissao");
  const [usuario, unidades] = await Promise.all([obterUsuario(id), listarUnidadesParaSelecao()]);
  if (!usuario) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        titulo={usuario.nome || usuario.email || "Usuário"}
        descricao={`Criado em ${formatarDataHora(usuario.created_at)} · último acesso ${usuario.ultimo_acesso ? formatarDataHora(usuario.ultimo_acesso) : "nunca"}`}
      />
      <UsuarioForm
        action={salvarUsuario.bind(null, usuario.id)}
        unidades={unidades}
        modo="edicao"
        valores={{
          email: usuario.email,
          nome: usuario.nome,
          papel: usuario.papel,
          branch_id: usuario.branch_id,
          ativo: usuario.ativo,
          filiaisAdicionais: usuario.filiaisAdicionais,
        }}
        ehProprioUsuario={usuario.id === sessao.id}
      />
    </>
  );
}
