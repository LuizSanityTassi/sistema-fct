import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { exigirAcesso } from "@/lib/auth/session";
import { lerParamsFolha, montarFolhasAssinatura, ROTA_FOLHA_ASSINATURA, type FolhaFunc } from "@/lib/data/ponto-folha";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { saldoTexto } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Folha para assinatura" };

/**
 * Folha para assinatura (cartão de ponto do período), fora do layout do sistema: uma página A4 por colaborador,
 * com as marcações dia a dia (pares entrada/saída), extras 50% e 100%, faltas/atrasos, noturno e carga, total do
 * período e linha de assinatura. O PDF sai pelo navegador (“Salvar como PDF”).
 */
export default async function ImprimirFolhaPage({ searchParams }: PageProps<"/imprimir/ponto/folha">) {
  const [sessao, sp] = await Promise.all([exigirAcesso(ROTA_FOLHA_ASSINATURA), searchParams]);
  const p = lerParamsFolha(sp, sessao);
  const { empresa, folhas } = await montarFolhasAssinatura(p);
  const periodo = `${formatarData(p.de)} a ${formatarData(p.ate)}`;
  const voltar = `${ROTA_FOLHA_ASSINATURA}?${new URLSearchParams({ ...(p.filial ? { filial: p.filial } : {}), ...(p.funcionario ? { funcionario: p.funcionario } : {}), de: p.de, ate: p.ate })}`;
  const emitido = `Emitido em ${formatarDataHora(new Date().toISOString())} por ${sessao.nome}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[210mm] bg-white p-6 text-[10px] leading-tight text-black print:p-0">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } .folha { break-after: page; } .folha:last-child { break-after: auto; } }`}</style>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Folha para assinatura</h1>
          <p className="text-sm text-muted-foreground">
            {empresa ? `${empresa.filialCodigo} ${empresa.filialNome} · ` : ""}
            {periodo} · {folhas.length} folha(s). Para PDF, escolha “Salvar como PDF” na janela de impressão.
            {p.cortado && <span className="ml-1 text-amber-800">O período foi cortado no limite de dias por folha.</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={voltar} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm">
            Voltar
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      {!p.filial && <p className="text-sm">Escolha a filial na tela anterior.</p>}
      {p.filial && folhas.length === 0 && <p className="text-sm">Nenhum colaborador neste filtro.</p>}
      {folhas.map((f) => (
        <Folha key={f.func.id} f={f} empresa={empresa} periodo={periodo} emitido={emitido} />
      ))}
    </main>
  );
}

const celula = "border border-black/60 px-1 py-[3px] text-center tabular-nums";
const cabecalho = "border border-black/60 bg-neutral-200 px-1 py-1 text-center font-semibold whitespace-nowrap print:bg-neutral-200";

function Folha({ f, empresa, periodo, emitido }: { f: FolhaFunc; empresa: { filialCodigo: string; filialNome: string; razaoSocial: string; cnpj: string } | null; periodo: string; emitido: string }) {
  const { linhas, pares, totais } = f.folha;
  const colunasMarcas = pares * 2;
  const func = f.func;
  return (
    <section className="folha mb-10 last:mb-0 print:mb-0">
      <h2 className="mb-2 text-center text-[13px] font-bold tracking-wide uppercase">Controle de jornada de trabalho</h2>

      <div className="mb-2 grid grid-cols-[1fr_auto] gap-3">
        <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-[2px] border border-black/60 p-1.5">
          <dt className="font-semibold">Empresa:</dt>
          <dd className="uppercase">{empresa?.razaoSocial || "—"}</dd>
          <dt className="font-semibold">CNPJ:</dt>
          <dd className="tabular-nums">{empresa?.cnpj || "—"}</dd>
          <dt className="font-semibold">Filial:</dt>
          <dd>
            {func.filialCodigo} {func.filialNome}
            {func.departamento ? ` · ${func.departamento}` : ""}
          </dd>
          <dt className="font-semibold">Período:</dt>
          <dd className="tabular-nums">{periodo}</dd>
          <dt className="font-semibold">Funcionário:</dt>
          <dd className="font-semibold uppercase">{func.nome}</dd>
          <dt className="font-semibold">CPF:</dt>
          <dd className="tabular-nums">{f.cpf || "—"}</dd>
          <dt className="font-semibold">Matrícula:</dt>
          <dd className="tabular-nums">{func.matricula ?? "—"}</dd>
          <dt className="font-semibold">Admissão:</dt>
          <dd className="tabular-nums">{formatarData(func.data_admissao)}</dd>
          <dt className="font-semibold">Cargo:</dt>
          <dd>{func.cargo ?? "—"}</dd>
          <dt className="font-semibold">Jornada:</dt>
          <dd>{f.jornada ?? "Sem jornada definida"}</dd>
        </dl>
        <table className="h-fit border-collapse text-[9px]">
          <tbody>
            {[
              ["Carga no período", totais.carga || "0:00"],
              ["Previsto", totais.previsto || "0:00"],
              ["Extra 50%", totais.extra50 || "0:00"],
              ["Extra 100%", totais.extra100 || "0:00"],
              ["Falta / atraso", totais.faltaAtraso || "0:00"],
              ["Noturno", totais.noturno || "0:00"],
              ["Saldo", saldoTexto(totais.saldo)],
            ].map(([k, v]) => (
              <tr key={k}>
                <th className="border border-black/60 px-1.5 py-[2px] text-left font-semibold whitespace-nowrap">{k}</th>
                <td className="border border-black/60 px-1.5 py-[2px] text-right tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cabecalho}>Data</th>
            <th className={cabecalho}>Dia</th>
            {Array.from({ length: pares }, (_, i) => (
              <Fragment key={i}>
                <th className={cabecalho}>Ent.</th>
                <th className={cabecalho}>Saí.</th>
              </Fragment>
            ))}
            <th className={cabecalho}>Extra 50%</th>
            <th className={cabecalho}>Extra 100%</th>
            <th className={cabecalho}>Falta/Atraso</th>
            <th className={cabecalho}>Noturno</th>
            <th className={cabecalho}>Carga</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.data} className={cn(l.tom === "descanso" && "bg-neutral-100 print:bg-neutral-100", l.tom === "falta" && "font-semibold")}>
              <td className={cn(celula, "whitespace-nowrap")}>{formatarData(l.data)}</td>
              <td className={cn(celula, "text-left")}>{l.dia}</td>
              {l.marcas.length === 0 ? (
                <td colSpan={colunasMarcas} className={cn(celula, "italic")}>
                  {l.texto}
                </td>
              ) : (
                Array.from({ length: colunasMarcas }, (_, i) => (
                  <td key={i} className={celula}>
                    {i === colunasMarcas - 1 ? l.marcas.slice(i).join(" ") : (l.marcas[i] ?? "")}
                  </td>
                ))
              )}
              <td className={celula}>{l.extra50}</td>
              <td className={celula}>{l.extra100}</td>
              <td className={celula}>{l.faltaAtraso}</td>
              <td className={celula}>{l.noturno}</td>
              <td className={celula}>{l.carga}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={2 + colunasMarcas} className={cn(celula, "text-left")}>
              Total do período · {totais.diasTrabalhados} dia(s) trabalhado(s) · {totais.faltas} falta(s) · {totais.atrasos} atraso(s)
            </td>
            <td className={celula}>{totais.extra50}</td>
            <td className={celula}>{totais.extra100}</td>
            <td className={celula}>{totais.faltaAtraso}</td>
            <td className={celula}>{totais.noturno}</td>
            <td className={celula}>{totais.carga}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-1 text-[8px] text-neutral-700">
        Horas no formato h:mm. Extra 100% = trabalho em folga ou feriado. Falta/Atraso = horas abaixo do previsto depois da tolerância da jornada. Noturno = minutos entre 22h e 5h. * = marcação incluída por ajuste aprovado.
        Declaro que conferi as marcações acima e que correspondem à jornada efetivamente cumprida no período.
      </p>

      <div className="mt-12 grid grid-cols-2 gap-16 text-center">
        <div>
          <div className="border-t border-black" />
          <p className="mt-1 font-semibold uppercase">{func.nome}</p>
          <p className="text-[8px] text-neutral-700">Assinatura do colaborador</p>
        </div>
        <div>
          <div className="border-t border-black" />
          <p className="mt-1 font-semibold uppercase">{empresa?.razaoSocial || `${func.filialCodigo} ${func.filialNome}`}</p>
          <p className="text-[8px] text-neutral-700">Assinatura do responsável</p>
        </div>
      </div>
      <p className="mt-3 text-right text-[8px] text-neutral-600">
        Sistema FCT · Controle de ponto · {emitido}
      </p>
    </section>
  );
}
