import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { listarRegionais } from "@/lib/data/filiais";
import { obterUsuario } from "@/lib/data/usuarios";
import { funcionariosDoCaixa } from "@/lib/data/diferenca-caixa";
import { formatarDataHora } from "@/lib/formatos";
import { excluirUsuario, salvarUsuario } from "../../actions";
import { UsuarioForm } from "../../usuario-form";
import { ExcluirUsuario } from "./excluir-usuario";

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
          adminSistema: usuario.admin_sistema,
          modulosBloqueados: usuario.modulos_bloqueados,
        }}
        funcionarios={opcoesFuncionario}
        ehProprioUsuario={usuario.id === sessao.id}
      />
      {usuario.id !== sessao.id && (
        <section className="mt-10 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-red-800">Excluir usuário</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">Apaga o login e o cadastro de vez. Para quem só saiu da empresa, desmarque “Acesso ativo” acima: o nome continua no histórico.</p>
          </div>
          <ExcluirUsuario action={excluirUsuario.bind(null, usuario.id)} nome={usuario.nome || usuario.email || "este usuário"} confirmacao={usuario.email || usuario.nome} />
        </section>
      )}
    </>
  );
}
