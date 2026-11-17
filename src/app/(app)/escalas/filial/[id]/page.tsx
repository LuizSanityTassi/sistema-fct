import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, Clock, ShieldAlert, Users } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { equipeDetalhada, escalasOficiais, filialDaEscala, funcionariosRh } from "@/lib/data/escalas";
import { preAnalise } from "@/lib/escalas/motor";
import { mesCurto, proximoMes } from "@/lib/escalas/resumo";
import { vinculoRh } from "@/lib/escalas/vinculo";
import { formatarDataHora } from "@/lib/formatos";
import { trazerDoRh } from "../../actions";
import { AbasEscala } from "../../abas";
import { ConfigFilialForm } from "./config-form";
import { EquipeEscala } from "./equipe";

export const metadata = { title: "Escala da filial" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default async function FilialEscalaPage({ params, searchParams }: PageProps<"/escalas/filial/[id]">) {
  const [, { id }, sp] = await Promise.all([exigirAcesso("/escalas"), params, searchParams]);
  if (!UUID.test(id)) notFound();
  const f = await filialDaEscala(id);
  if (!f) notFound();
  const [equipe, todosRh, rhDaFilial, oficiais] = await Promise.all([equipeDetalhada(id), funcionariosRh(), funcionariosRh(id), escalasOficiais()]);
  const ref = proximoMes();
  const pre = preAnalise(f.config, f.equipe, { ano: ref.ano, mes: ref.mes, jornadaSemanal: 40 });
  const naEscala = new Set(equipe.map((c) => c.employee_id).filter(Boolean));
  const foraDaEscala = rhDaFilial.filter((e) => !naEscala.has(e.id));
  const divergentes = equipe.map((c) => ({ c, v: vinculoRh(c, id) })).filter(({ v }) => v.tom !== "sucesso");
  const minhasOficiais = oficiais.filter((o) => o.branch_id === id);
  const l = f.linha;

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

      <Painel titulo="Funcionamento" icone={Clock} descricao={`Origem: ${l.origem ?? "—"} · atualizado em ${formatarDataHora(l.atualizado_em)}`} className="mb-4">
        <ConfigFilialForm
          branchId={id}
          podeEditar
          valores={{
            semana_abre: hm(l.semana_abre),
            semana_fecha: hm(l.semana_fecha),
            sabado_abre: hm(l.sabado_abre),
            sabado_fecha: hm(l.sabado_fecha),
            domingo_abre: hm(l.domingo_abre),
            domingo_fecha: hm(l.domingo_fecha),
            min_farmaceuticos: l.min_farmaceuticos,
            acordo: l.acordo_jornada_estendida,
            folgas: l.folgas_permitidas,
          }}
        />
      </Painel>

      <Painel titulo="Equipe da escala" icone={Users} descricao={`${equipe.length} pessoas · os horários de origem vieram da planilha HORARIO COLABORADORES e ficam só como referência`} className="mb-4">
        <EquipeEscala branchId={id} equipe={equipe} funcionarios={todosRh} />
      </Painel>

      {(divergentes.length > 0 || foraDaEscala.length > 0) && (
        <Painel titulo="Conferência com o cadastro do RH" icone={ShieldAlert} descricao="O que está diferente entre a equipe da escala e as fichas do RH." className="mb-4">
          <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
            {divergentes.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Na escala, com diferença no RH ({divergentes.length})</h3>
                <ul className="space-y-1 text-sm">
                  {divergentes.map(({ c, v }) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
                      <span>{c.nome}</span>
                      <Status tom={v.tom}>{v.texto}</Status>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">“RH: outra filial” costuma ser terceirizado (ADM, RFA, TRIO, CIRLEI) ou transferência ainda não atualizada.</p>
              </div>
            )}
            {foraDaEscala.length > 0 && (
              <form action={trazerDoRh}>
                <input type="hidden" name="branch_id" value={id} />
                <h3 className="mb-2 text-sm font-semibold">No RH desta filial, fora da escala ({foraDaEscala.length})</h3>
                <ul className="space-y-1 text-sm">
                  {foraDaEscala.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 border-b pb-1 last:border-0">
                      <input type="checkbox" name="employee_id" value={e.id} defaultChecked={e.status === "ativo"} className="size-4 accent-primary" aria-label={`Trazer ${e.nome}`} />
                      <span className="flex-1">{e.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.cargo ?? "sem cargo"}
                        {e.status !== "ativo" ? ` · ${e.status === "ferias" ? "férias" : e.status}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button type="submit" variant="outline" size="sm" className="mt-2">
                  Trazer marcados para a escala
                </Button>
              </form>
            )}
          </div>
        </Painel>
      )}

      <Painel titulo="Escalas oficiais desta filial" icone={CalendarRange}>
        {minhasOficiais.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted-foreground">Nenhuma escala oficial publicada ainda.</p>
        ) : (
          <ul className="px-5 pb-4 text-sm">
            {minhasOficiais.map((o) => (
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
