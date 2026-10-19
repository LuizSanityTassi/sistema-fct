import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { listarRegionais } from "@/lib/data/filiais";
import { convidarUsuario } from "../actions";
import { UsuarioForm } from "../usuario-form";

export const metadata = { title: "Convidar usuário" };

export default async function NovoUsuarioPage() {
  const sessao = await exigirAcesso("/configuracoes/usuarios");
  if (sessao.papel !== "admin") semAcesso("/configuracoes/usuarios");
  const [unidades, regionais] = await Promise.all([listarUnidadesParaSelecao(), listarRegionais()]);

  return (
    <>
      <PageHeader eyebrow="Administração" titulo="Convidar usuário" descricao="A pessoa recebe um e-mail com link para criar a senha. O papel define o que ela enxerga." />
      <UsuarioForm action={convidarUsuario} unidades={unidades} regionais={regionais} modo="convite" valores={{ papel: "usuario" }} />
    </>
  );
}
