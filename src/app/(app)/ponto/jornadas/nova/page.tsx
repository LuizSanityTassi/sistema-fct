import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { administraPonto } from "@/lib/data/ponto";
import { salvarJornada } from "../actions";
import { JornadaForm } from "../jornada-form";

export const metadata = { title: "Nova jornada" };

export default async function NovaJornadaPage() {
  const sessao = await exigirAcesso("/ponto/jornadas/nova");
  if (!administraPonto(sessao)) semAcesso("/ponto/jornadas/nova");
  const unidades = await listarUnidadesParaSelecao();
  return (
    <>
      <PageHeader eyebrow="Ponto" titulo="Nova jornada" descricao="Escolha um modelo pronto ou preencha os horários de cada dia." />
      <JornadaForm action={salvarJornada.bind(null, null)} filiais={unidades.filter((u) => u.ativo)} />
    </>
  );
}
