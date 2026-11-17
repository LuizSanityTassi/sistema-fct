import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { escalasOficiais, filialDaEscala } from "@/lib/data/escalas";
import { preAnalise } from "@/lib/escalas/motor";
import { mesCurto, proximoMes } from "@/lib/escalas/resumo";
import { formatarDataHora } from "@/lib/formatos";
import { AbasEscala } from "../../abas";
import { SecoesFilial } from "../../_ui/secoes-filial";

export const metadata = { title: "Escala da filial" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FilialEscalaPage({ params, searchParams }: PageProps<"/escalas/filial/[id]">) {
  const [, { id }, sp] = await Promise.all([exigirAcesso("/escalas"), params, searchParams]);
  if (!UUID.test(id)) notFound();
  const f = await filialDaEscala(id);
  if (!f) notFound();
  const oficiais = (await escalasOficiais()).filter((o) => o.branch_id === id);
  const ref = proximoMes();
  const pre = preAnalise(f.config, f.equipe, { ano: ref.ano, mes: ref.mes, jornadaSemanal: 40 });

  return (
    <>
      <PageHeader
        eyebrow="Escala 5x2 · filial"
        titulo={`${f.codigo} · ${f.nome}`}
        descricao={`${f.regional ?? "Sem regional"} · ${f.equipe.filter((p) => p.situacao === "ativo").length} pessoas ativas na escala. Pré-análise de ${mesCurto(ref.ano, ref.mes)}: ${pre.rotulo.toLowerCase()}.`}
        acoes={
          <Button render={<Link href={`/escalas/simulador?filial=${id}`} />} nativeButton={false}>
            <CalendarRange data-icon="inline-start" />
            Simular esta filial
          </Button>
        }
      />
      <AbasEscala ativa={null} />
      {sp.incluida && <AvisoSucesso mensagem="Filial incluída na escala com a equipe do cadastro do RH. Confira as funções e informe o horário da loja." />}

      <div className="mb-4 rounded-xl border bg-card px-5 py-3 text-sm">
        <span className="font-medium">Pré-análise:</span> {pre.detalhe}
      </div>

      <SecoesFilial f={f} />

      <Painel titulo="Escalas oficiais desta filial" icone={CalendarRange}>
        {oficiais.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted-foreground">Nenhuma escala oficial publicada ainda.</p>
        ) : (
          <ul className="px-5 pb-4 text-sm">
            {oficiais.map((o) => (
              <li key={o.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                <Link href={`/escalas/simulacao/${o.lote}?filial=${id}&op=${o.id}`} className="font-medium hover:underline">
                  {mesCurto(o.ano, o.mes)} · opção {o.opcao} · {o.jornada_semanal} h
                </Link>
                <span className="text-xs text-muted-foreground">
                  publicada {o.publicado_em ? formatarDataHora(o.publicado_em) : ""} {o.publicador?.nome ? `por ${o.publicador.nome}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </>
  );
}
