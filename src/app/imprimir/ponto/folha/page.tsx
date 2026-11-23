import type { Metadata } from "next";
import Link from "next/link";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { exigirAcesso } from "@/lib/auth/session";
import { lerParamsFolha, montarFolhasAssinatura, ROTA_FOLHA_ASSINATURA, type EmpresaFolha, type FolhaFunc } from "@/lib/data/ponto-folha";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Folha para assinatura" };

/**
 * Folha para assinatura (controle de jornada do período) no layout que o RH já confere hoje: uma página A4 paisagem
 * por colaborador — cabeçalho com empresa, CNPJ, colaborador, setor, CPF, CTPS e PIS, o quadro de horários da semana,
 * a tabela dia a dia (Ent 1 · Sai 1 · Ent 2 · Sai 2 · Normais · Extra Ent · Extra Sai · Extra Tot · Extra 50% · 60% ·
 * 75% · 100% · Noturno · Carga), a linha de totais e a assinatura. O PDF sai pelo navegador (“Salvar como PDF”).
 */
export default async function ImprimirFolhaPage({ searchParams }: PageProps<"/imprimir/ponto/folha">) {
  const [sessao, sp] = await Promise.all([exigirAcesso(ROTA_FOLHA_ASSINATURA), searchParams]);
  const p = lerParamsFolha(sp, sessao);
  const { empresa, folhas } = await montarFolhasAssinatura(p);
  const periodo = `${formatarData(p.de)} a ${formatarData(p.ate)}`;
  const voltar = `${ROTA_FOLHA_ASSINATURA}?${new URLSearchParams({ ...(p.filial ? { filial: p.filial } : {}), ...(p.funcionario ? { funcionario: p.funcionario } : {}), de: p.de, ate: p.ate })}`;
  const emitido = `Emitido em ${formatarDataHora(new Date().toISOString())} por ${sessao.nome}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[297mm] bg-white p-6 font-sans text-[9px] leading-tight text-black print:p-0">
      <style>{`@page { size: A4 landscape; margin: 8mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } .folha { break-after: page; } .folha:last-child { break-after: auto; } }`}</style>
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
        <Folha key={f.func.id} f={f} empresa={f.empresa ?? empresa} emitido={emitido} />
      ))}
    </main>
  );
}

const borda = "border border-black";
const cab = `${borda} px-1 py-[3px] text-center font-bold whitespace-nowrap`;
const cel = `${borda} px-1 py-[2px] text-center tabular-nums`;

function Folha({ f, empresa, emitido }: { f: FolhaFunc; empresa: EmpresaFolha | null; emitido: string }) {
  const { linhas, semana, totais } = f.folha;
  const func = f.func;
  const setor = [func.cargo, func.departamento].filter(Boolean).join(" - ");
  // f.empresa = filial da folha (registrada em outra filial): mostra a dela; senão a filial do ponto
  const nomeEmpresa = [empresa?.razaoSocial, f.empresa ? `${f.empresa.filialCodigo} ${f.empresa.filialNome}` : `${func.filialCodigo} ${func.filialNome}`].filter(Boolean).join(" ");
  return (
    <section className="folha mb-10 last:mb-0 print:mb-0">
      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td colSpan={3} className={cn(borda, "py-1 text-center text-[11px] font-bold uppercase")}>
                Controle de jornada de trabalho
              </td>
            </tr>
            <tr>
              <td colSpan={2} className={cn(borda, "px-1.5 py-1 uppercase")}>
                <b className="normal-case">Empresa:</b> {nomeEmpresa || "—"}
              </td>
              <td className={cn(borda, "px-1.5 py-1 tabular-nums")}>
                <b>CNPJ:</b> {empresa?.cnpj || "—"}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className={cn(borda, "px-1.5 py-1 uppercase")}>
                <b className="normal-case">Colaborador:</b> {func.nome}
              </td>
              <td className={cn(borda, "px-1.5 py-1 uppercase")}>
                <b className="normal-case">Setor:</b> {setor || "—"}
              </td>
            </tr>
            <tr>
              <td className={cn(borda, "w-1/3 px-1.5 py-1 tabular-nums")}>
                <b>CPF:</b> {f.cpf || ""}
              </td>
              <td className={cn(borda, "w-1/3 px-1.5 py-1")}>
                <b>CTPS:</b>
              </td>
              <td className={cn(borda, "px-1.5 py-1 tabular-nums")}>
                <b>Nº PIS/PASEP:</b> {f.pis || ""}
              </td>
            </tr>
          </tbody>
        </table>
        <table className={cn(borda, "h-fit border-collapse text-[8px]")}>
          <thead>
            <tr>
              <th className="px-1.5 pt-1 text-left font-normal" />
              <th className="px-2 pt-1 font-bold">Ent 1</th>
              <th className="px-2 pt-1 font-bold">Sai 1</th>
              <th className="px-2 pt-1 font-bold">Ent 2</th>
              <th className="px-2 pt-1 font-bold">Sai 2</th>
            </tr>
          </thead>
          <tbody>
            {semana.map((s) => (
              <tr key={s.dia}>
                <td className="px-1.5 text-left">{s.dia}</td>
                {s.horarios.map((hr, i) => (
                  <td key={i} className="px-2 text-center tabular-nums">
                    {hr}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(cab, "text-left")}>Data</th>
            <th className={cab}>Ent 1</th>
            <th className={cab}>Sai 1</th>
            <th className={cab}>Ent 2</th>
            <th className={cab}>Sai 2</th>
            <th className={cab}>Normais</th>
            <th className={cab}>Extra Ent</th>
            <th className={cab}>Extra Sai</th>
            <th className={cab}>Extra Tot</th>
            <th className={cab}>Extra 50%</th>
            <th className={cab}>Extra 60%</th>
            <th className={cab}>Extra 75%</th>
            <th className={cab}>Extra 100%</th>
            <th className={cab}>Noturno</th>
            <th className={cab}>Carga</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.data} className={cn(l.descanso && "bg-neutral-100 print:bg-neutral-100")}>
              <td className={cn(cel, "text-left whitespace-nowrap")}>
                {formatarData(l.data)} - {l.dia} {l.obs && <b>({l.obs})</b>} -
              </td>
              {l.normais.map((m, i) => (
                <td key={i} className={cel}>
                  {m}
                </td>
              ))}
              <td className={cel}>{l.normaisH}</td>
              <td className={cel}>{l.extras[0]}</td>
              <td className={cel}>{l.extras[1]}</td>
              <td className={cel}>{l.extraTot}</td>
              <td className={cel}>{l.extra50}</td>
              <td className={cel} />
              <td className={cel} />
              <td className={cel}>{l.extra100}</td>
              <td className={cel}>{l.noturno}</td>
              <td className={cel}>{l.carga}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className={cn(cel, "text-left")}>Totais:</td>
            <td className={cel} colSpan={4} />
            <td className={cel}>{totais.normaisH}</td>
            <td className={cel} colSpan={2} />
            <td className={cel}>{totais.extraTot}</td>
            <td className={cel}>{totais.extra50}</td>
            <td className={cel}>00:00</td>
            <td className={cel}>00:00</td>
            <td className={cel}>{totais.extra100}</td>
            <td className={cel}>{totais.noturno}</td>
            <td className={cel}>{totais.carga}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mx-auto mt-10 w-1/2 text-center">
        <div className="border-t border-black" />
        <p className="mt-1 text-[10px] font-bold uppercase">{func.nome}</p>
      </div>
      <p className="mt-3 text-right text-[7px] text-neutral-600">* marcação incluída por ajuste aprovado · Sistema FCT · Controle de ponto · {emitido}</p>
    </section>
  );
}
