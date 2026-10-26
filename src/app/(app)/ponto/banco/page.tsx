import Link from "next/link";
import { Hourglass, UserX } from "lucide-react";
import { ColunasResultado } from "@/components/graficos";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { EstadoVazio, Indicador, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { administraPonto, bancoDeHoras, gerePonto, lerUuid, listarEquipe, meuFuncionario, MOVIMENTO_LABEL, obterFuncPonto, rotuloMes, type BancoFunc } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { duracao, hojeLocal, saldoTexto } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";
import { BotoesExportar } from "../_ui/exportar";
import { lancarMovimento, removerMovimento } from "./actions";
import { MovimentoForm } from "./movimento-form";

export const metadata = { title: "Banco de horas" };

const TAMANHO = 50;
const tomSaldo = (m: number) => (m < 0 ? "text-red-700" : m > 0 ? "text-emerald-700" : "text-muted-foreground");

function Extrato({ b, podeLancar, hoje }: { b: BancoFunc; podeLancar: boolean; hoje: string }) {
  // linha do tempo: meses (abertos calculados, fechados pelo lançamento) + lançamentos manuais, com saldo acumulado
  type Item = { chave: string; data: string; titulo: string; detalhe?: string; minutos: number; fechado?: boolean; aberto?: boolean; id?: string; manual?: boolean };
  const itens: Item[] = [
    ...b.meses.filter((m) => !m.fechado).map((m) => ({ chave: `m${m.competencia}`, data: `${m.competencia}-31`, titulo: `Saldo de ${rotuloMes(m.competencia)}`, detalhe: "Mês aberto: calculado das marcações", minutos: m.saldo, aberto: true })),
    ...b.movimentos.map((m) => ({ chave: m.id, data: m.data, titulo: MOVIMENTO_LABEL[m.tipo] ?? m.tipo, detalhe: m.descricao ?? undefined, minutos: m.minutos, fechado: m.tipo === "fechamento", id: m.id, manual: m.tipo !== "fechamento" })),
  ].sort((a, c) => a.data.localeCompare(c.data));
  let acumulado = 0;
  const linhas = itens.map((i) => ({ ...i, acumulado: (acumulado += i.minutos) }));
  return (
    <>
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Saldo atual" icone={Hourglass} valor={saldoTexto(b.total)} tomValor={b.total < 0 ? "perigo" : b.total > 0 ? "sucesso" : undefined} />
        <Indicador rotulo="Horas positivas" valor={duracao(b.creditos)} tomValor="sucesso" />
        <Indicador rotulo="Horas negativas" valor={duracao(b.debitos)} tomValor={b.debitos ? "perigo" : undefined} />
        <Indicador rotulo="Meses em aberto" valor={saldoTexto(b.saldoAberto)} detalhe="Ainda podem mudar com ajustes" />
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Painel titulo="Saldo por mês">
          {b.meses.length === 0 ? (
            <EstadoVazio icone={Hourglass} titulo="Sem meses apurados" descricao="O banco começa quando a jornada do funcionário é definida." compacto />
          ) : (
            <div className="border-t px-5 py-4">
              <ColunasResultado dados={b.meses.map((m) => ({ rotulo: rotuloMes(m.competencia).slice(0, 3), valor: m.saldo, texto: saldoTexto(m.saldo) }))} titulo="Saldo do banco por mês" rotuloValor="Saldo" />
              <ul className="mt-3 space-y-1 text-sm">
                {b.meses
                  .slice()
                  .reverse()
                  .map((m) => (
                    <li key={m.competencia} className="flex items-center justify-between gap-2">
                      <span className="first-letter:uppercase">{rotuloMes(m.competencia)}</span>
                      <span className="flex items-center gap-2">
                        {m.fechado ? <Status tom="info">Fechado</Status> : <Status tom="neutro">Aberto</Status>}
                        <span className={cn("w-16 text-right font-medium tabular-nums", tomSaldo(m.saldo))}>{saldoTexto(m.saldo)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Painel>
        <Painel titulo="Extrato" descricao="Do mais antigo ao mais recente, com o saldo depois de cada linha.">
          {linhas.length === 0 ? (
            <p className="border-t px-5 py-4 text-sm text-muted-foreground">Nada lançado ainda.</p>
          ) : (
            <ul className="border-t">
              {linhas.map((l) => (
                <li key={l.chave} className="grid grid-cols-[5.5rem_1fr_auto_auto] items-start gap-3 border-b px-5 py-2 text-sm last:border-0">
                  <span className="text-muted-foreground tabular-nums">{l.aberto ? "em aberto" : formatarData(l.data)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{l.titulo}</span>
                    {l.detalhe && <span className="block text-xs text-muted-foreground">{l.detalhe}</span>}
                  </span>
                  <span className={cn("text-right tabular-nums", tomSaldo(l.minutos))}>{saldoTexto(l.minutos)}</span>
                  <span className="flex items-center gap-2">
                    <span className="w-16 text-right font-semibold tabular-nums">{saldoTexto(l.acumulado)}</span>
                    {podeLancar && l.manual && l.id && (
                      <ConfirmarAcao titulo="Remover lançamento?" descricao={`${l.titulo} de ${saldoTexto(l.minutos)}. Fica registrado na auditoria.`} rotuloBotao="Remover" rotuloConfirmar="Remover lançamento" variant="outline" action={removerMovimento} campos={{ id: l.id }} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeLancar && <MovimentoForm action={lancarMovimento.bind(null, b.func.id)} hoje={hoje} />}
        </Painel>
      </div>
    </>
  );
}

export default async function BancoPage({ searchParams }: PageProps<"/ponto/banco">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/banco"), searchParams]);
  const gestor = gerePonto(sessao);
  const hoje = hojeLocal();
  const pedido = lerUuid(sp.funcionario);
  const eu = await meuFuncionario();

  // um funcionário: o pedido (gestor) ou o próprio
  if (pedido || !gestor) {
    const func = pedido && gestor ? await obterFuncPonto(pedido) : eu;
    if (!func) {
      return (
        <>
          <PageHeader eyebrow="Ponto" titulo="Banco de horas" />
          <Painel>
            <EstadoVazio icone={UserX} titulo="Seu usuário não está ligado a um funcionário" descricao="Peça ao administrador para ligar o seu usuário ao seu cadastro no RH." />
          </Painel>
        </>
      );
    }
    const [b] = await bancoDeHoras([func]);
    return (
      <>
        <PageHeader
          eyebrow="Ponto"
          titulo={`Banco de horas${func.id === eu?.id ? "" : ` · ${func.nome}`}`}
          descricao={`${func.nome} · ${func.filialCodigo} ${func.filialNome}. Meses fechados entram pelo fechamento; o mês aberto é calculado das marcações e ainda pode mudar.`}
          acoes={gestor && <Link href="/ponto/banco" className="text-sm text-fct-tinta underline">Equipe toda</Link>}
        />
        <Extrato b={b} podeLancar={administraPonto(sessao)} hoje={hoje} />
      </>
    );
  }

  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const equipe = await listarEquipe({ filial: filtros.filial, departamento: filtros.departamento, q: filtros.q });
  const bancos = (await bancoDeHoras(equipe)).sort((a, b) => a.total - b.total);
  const totalPos = bancos.filter((b) => b.total > 0).reduce((s, b) => s + b.total, 0);
  const totalNeg = bancos.filter((b) => b.total < 0).reduce((s, b) => s + b.total, 0);
  const pag = bancos.slice((pagina - 1) * TAMANHO, pagina * TAMANHO);
  const params = { filial: filtros.filial ?? (sp.filial === "todas" ? "todas" : undefined), departamento: filtros.departamento, q: filtros.q };

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Banco de horas"
        descricao="Saldo de cada funcionário: meses fechados + o mês em aberto calculado das marcações. Clique no nome para ver o extrato."
        acoes={<BotoesExportar params={{ relatorio: "banco", filial: filtros.filial, departamento: filtros.departamento, q: filtros.q }} />}
      />
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Saldo da equipe" valor={saldoTexto(totalPos + totalNeg)} tomValor={totalPos + totalNeg < 0 ? "perigo" : "sucesso"} />
        <Indicador rotulo="Horas a compensar ou pagar" valor={duracao(totalPos)} tomValor="sucesso" detalhe={`${bancos.filter((b) => b.total > 0).length} com saldo positivo`} />
        <Indicador rotulo="Horas devidas" valor={duracao(-totalNeg)} tomValor={totalNeg ? "perigo" : undefined} detalhe={`${bancos.filter((b) => b.total < 0).length} com saldo negativo`} />
        <Indicador rotulo="Acima de 40h" valor={bancos.filter((b) => b.total > 40 * 60).length} tomValor="atencao" detalhe="Atenção ao prazo de compensação" />
      </section>
      <BarraFiltrosPonto rota="/ponto/banco" filtros={filtros} />
      <Painel titulo={`${bancos.length} funcionário(s)`} descricao="Do mais negativo ao mais positivo.">
        {bancos.length === 0 ? (
          <EstadoVazio icone={Hourglass} titulo="Ninguém neste filtro" compacto />
        ) : (
          <>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead className="hidden md:table-cell">Filial</TableHead>
                    <TableHead className="text-right">Positivas</TableHead>
                    <TableHead className="text-right">Negativas</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Mês aberto</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pag.map((b) => (
                    <TableRow key={b.func.id}>
                      <TableCell>
                        <Link href={`/ponto/banco?funcionario=${b.func.id}`} className="font-medium hover:underline">
                          {b.func.nome}
                        </Link>
                        {b.func.departamento && <p className="text-xs text-muted-foreground">{b.func.departamento}</p>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono text-xs text-fct-tinta">{b.func.filialCodigo}</span> {b.func.filialNome}
                      </TableCell>
                      <TableCell className="text-right text-emerald-700 tabular-nums">{b.creditos ? duracao(b.creditos) : ""}</TableCell>
                      <TableCell className="text-right text-red-700 tabular-nums">{b.debitos ? duracao(b.debitos) : ""}</TableCell>
                      <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", tomSaldo(b.saldoAberto))}>{saldoTexto(b.saldoAberto)}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", tomSaldo(b.total))}>{saldoTexto(b.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-4 py-3">
              <Paginacao pagina={pagina} paginas={Math.max(1, Math.ceil(bancos.length / TAMANHO))} total={bancos.length} tamanho={TAMANHO} params={params} />
            </div>
          </>
        )}
      </Painel>
    </>
  );
}
