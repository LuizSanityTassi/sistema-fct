import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { administraPonto, listarJornadas } from "@/lib/data/ponto";
import { salvarJornada } from "../actions";
import { JornadaForm } from "../jornada-form";

export const metadata = { title: "Editar jornada" };

export default async function EditarJornadaPage({ params }: PageProps<"/ponto/jornadas/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/ponto/jornadas"), params]);
  if (!administraPonto(sessao)) semAcesso("/ponto/jornadas");
  const [jornadas, unidades] = await Promise.all([listarJornadas(), listarUnidadesParaSelecao()]);
  const j = jornadas.find((x) => x.id === id);
  if (!j) notFound();
  return (
    <>
      <PageHeader eyebrow="Ponto · jornada" titulo={j.nome} descricao="Alterar horários, tolerância e onde a jornada vale." />
      <JornadaForm action={salvarJornada.bind(null, j.id)} inicial={j} filiais={unidades.filter((u) => u.ativo || u.id === j.branch_id)} />
    </>
  );
}
