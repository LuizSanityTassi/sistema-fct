import Link from "next/link";
import { Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { administraPonto, apurar, listarAjustes, listarEquipe, listarFechamentos, mesAnterior, nomesDePerfis, rotuloMes } from "@/lib/data/ponto";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { duracao, hojeLocal, limitesMes, saldoTexto } from "@/lib/ponto/calculo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";
import { FecharMes, ReabrirMes } from "./acoes-fechamento";
import { fecharMes, reabrirMes } from "./actions";

export const metadata = { title: "Fechamento do ponto" };

export default async function FechamentoPage({ searchParams }: PageProps<"/ponto/fechamento">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/fechamento"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const hoje = hojeLocal();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesAnterior(hoje.slice(0, 7));
  const { de, ate } = limitesMes(mes);
  const terminou = ate < hoje;
  const pode = administraPonto(sessao);
  const supabase = await createClient();

  const equipe = (await listarEquipe({ filial: filtros.filial, desligados: true })).filter((f) => (!f.data_desligamento || f.data_desligamento >= de) && (!f.data_admissao || f.data_admissao <= ate));
  const [aps, fechs, pendentes] = await Promise.all([apurar(equipe, de, ate > hoje ? hoje : ate), listarFechamentos([`${mes}-01`]), listarAjustes({ status: "pendente", filial: filtros.filial, de, ate })]);
  const nomes = await nomesDePerfis(supabase, fechs.flatMap((f) => [f.fechado_por, f.reaberto_por]).filter(Boolean) as string[]);

  type Linha = { id: string; nome: string; funcionarios: number; inconsistencias: number; incompletos: number; faltas: number; extra: number; saldo: number; semJornada: number; pendentes: number };
  const porFilial = new Map<string, Linha>();
  for (const a of aps) {
    const l = porFilial.get(a.func.branch_id) ?? { id: a.func.branch_id, nome: `${a.func.filialCodigo} ${a.func.filialNome}`, funcionarios: 0, inconsistencias: 0, incompletos: 0, faltas: 0, extra: 0, saldo: 0, semJornada: 0, pendentes: 0 };
    l.funcionarios++;
    l.inconsistencias += a.totais.inconsistencias;
    l.incompletos += a.totais.incompletos;
    l.faltas += a.totais.faltas;
    l.extra += a.totais.extra;
    l.saldo += a.totais.saldo;
    if (!a.jornadaAtual) l.semJornada++;
    porFilial.set(a.func.branch_id, l);
  }
  for (const p of pendentes) {
    const l = porFilial.get(p.branch_id);
    if (l) l.pendentes++;
  }
  const filiais = [...porFilial.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const fechDe = new Map(fechs.map((f) => [f.branch_id, f]));
  const uma = filtros.filial ? filiais.find((f) => f.id === filtros.filial) : undefined;
  const fechUma = uma ? fechDe.get(uma.id) : undefined;
  const fechadas = filiais.filter((f) => fechDe.get(f.id)?.status === "fechado").length;
  const comProblema = aps.filter((a) => a.totais.inconsistencias > 0 || !a.jornadaAtual);

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo={`Fechamento · ${rotuloMes(mes)}`}
        descricao="Confira as inconsistências e os ajustes pendentes de cada filial. Fechar trava o mês e lança o saldo de cada funcionário no banco de horas; só o administrador reabre."
      />
      <BarraFiltrosPonto rota="/ponto/fechamento" filtros={filtros} mes={mes} busca={false} />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Filiais fechadas" icone={Lock} valor={`${fechadas} de ${filiais.length}`} tomValor={fechadas === filiais.length && filiais.length ? "sucesso" : undefined} />
        <Indicador rotulo="Dias com inconsistência" icone={TriangleAlert} valor={filiais.reduce((s, f) => s + f.inconsistencias, 0)} tomValor="alerta" />
        <Indicador rotulo="Ajustes pendentes" valor={pendentes.length} tomValor={pendentes.length ? "atencao" : undefined} href="/ponto/ajustes?aba=aprovar" />
        <Indicador rotulo="Saldo do mês (todos)" valor={saldoTexto(filiais.reduce((s, f) => s + f.saldo, 0))} />
      </section>

      {!terminou && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {rotuloMes(mes)} ainda não terminou: dá para conferir, mas fechar só depois do último dia.
        </p>
      )}

      {uma && (
        <Painel
          className="mb-4"
          titulo={uma.nome}
          descricao={fechUma?.status === "fechado" ? `Fechado em ${formatarDataHora(fechUma.fechado_em)}${fechUma.fechado_por && nomes.get(fechUma.fechado_por) ? ` por ${nomes.get(fechUma.fechado_por)}` : ""}.` : fechUma?.status === "reaberto" ? `Reaberto em ${formatarDataHora(fechUma.reaberto_em)}: ${fechUma.motivo_reabertura ?? ""}` : "Mês aberto."}
          acao={
            fechUma?.status === "fechado"
              ? sessao.papel === "admin" && <ReabrirMes action={reabrirMes} id={fechUma.id} rotulo={`${rotuloMes(mes)} · ${uma.nome}`} />
              : pode && (
                  <FecharMes
                    action={fecharMes}
                    branchId={uma.id}
                    mes={mes}
                    rotulo={`${rotuloMes(mes)} · ${uma.nome}`}
                    inconsistencias={uma.inconsistencias}
                    bloqueio={!terminou ? "O mês ainda não terminou" : uma.pendentes ? `${uma.pendentes} ajuste(s) pendente(s)` : null}
                  />
                )
          }
        >
          {comProblema.length === 0 ? (
            <EstadoVazio icone={Lock} titulo="Nenhuma inconsistência" descricao="Todos com jornada definida e dias sem problemas." compacto />
          ) : (
            <ul className="border-t">
              {comProblema.map((a) => {
                const graves = a.dias.filter((d) => d.ocorrencias.some((o) => o.grave));
                return (
                  <li key={a.func.id} className="border-b px-5 py-2.5 text-sm last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/ponto/espelho?funcionario=${a.func.id}&mes=${mes}`} className="font-medium hover:underline">
                        {a.func.nome}
                      </Link>
                      <span className="flex gap-2 text-xs">
                        {!a.jornadaAtual && <Status tom="atencao">Sem jornada</Status>}
                        {a.totais.incompletos > 0 && <Status tom="alerta">{a.totais.incompletos} incompleto(s)</Status>}
                        {a.totais.faltas > 0 && <Status tom="perigo">{a.totais.faltas} falta(s)</Status>}
                        <span className={cn("tabular-nums", a.totais.saldo < 0 ? "text-red-700" : "text-emerald-700")}>{saldoTexto(a.totais.saldo)}</span>
                      </span>
                    </div>
                    {graves.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {graves
                          .slice(0, 6)
                          .map((d) => `${formatarData(d.data).slice(0, 5)}: ${d.ocorrencias.find((o) => o.grave)!.texto.toLowerCase()}`)
                          .join(" · ")}
                        {graves.length > 6 ? ` · e mais ${graves.length - 6}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
      )}

      <Painel titulo="Por filial" descricao={uma ? undefined : "Escolha uma filial no filtro para ver os detalhes e fechar."}>
        {filiais.length === 0 ? (
          <EstadoVazio icone={Lock} titulo="Nenhum funcionário neste filtro" compacto />
        ) : (
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filial</TableHead>
                  <TableHead className="text-right">Pessoas</TableHead>
                  <TableHead className="text-right">Inconsistências</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Faltas</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Extras</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Ajustes</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filiais.map((f) => {
                  const fe = fechDe.get(f.id);
                  return (
                    <TableRow key={f.id} className={cn(f.id === uma?.id && "bg-muted/40")}>
                      <TableCell>
                        <Link href={`/ponto/fechamento?mes=${mes}&filial=${f.id}`} className="font-medium hover:underline">
                          {f.nome}
                        </Link>
                        {f.semJornada > 0 && <p className="text-xs text-amber-800">{f.semJornada} sem jornada</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.funcionarios}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", f.inconsistencias && "text-orange-700")}>{f.inconsistencias}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{f.faltas}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{duracao(f.extra)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", f.saldo < 0 ? "text-red-700" : "text-emerald-700")}>{saldoTexto(f.saldo)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", f.pendentes && "text-amber-800")}>{f.pendentes}</TableCell>
                      <TableCell>{fe?.status === "fechado" ? <Status tom="info">Fechado</Status> : fe?.status === "reaberto" ? <Status tom="atencao">Reaberto</Status> : <Status tom="neutro">Aberto</Status>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Painel>
    </>
  );
}
