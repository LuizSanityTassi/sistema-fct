import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { exigirAcesso } from "@/lib/auth/session";
import { simulacao } from "@/lib/data/escalas";
import { ROTULO_DIA, ROTULO_FUNCAO, diaChave } from "@/lib/escalas/motor";
import { agruparAlertas, celula, datasTexto, mesCurto, nomeMes, rotuloDias, textoFuncionamento } from "@/lib/escalas/resumo";

export const metadata: Metadata = { title: "Escala 5x2" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COR: Record<string, string> = { trabalho: "#e4f1ea", folga: "#fff0cc", fechado: "#f0f2f0", afastamento: "#ede9fe", inativo: "#f0f2f0" };

/** Escala do mês no papel (A4 deitado): grade, turnos com almoço, horas e pendências. ?pessoa= para a individual. */
export default async function ImprimirEscalaPage({ params, searchParams }: PageProps<"/imprimir/escala/[id]">) {
  const [, { id }, sp] = await Promise.all([exigirAcesso("/escalas"), params, searchParams]);
  if (!UUID.test(id)) notFound();
  const s = await simulacao(id);
  if (!s) notFound();
  const pessoaId = typeof sp.pessoa === "string" ? sp.pessoa : "";
  const equipe = pessoaId ? s.equipe.filter((p) => p.id === pessoaId) : s.equipe;
  if (pessoaId && !equipe.length) notFound();
  const alertas = pessoaId ? s.alertas.filter((a) => !a.pessoaId || a.pessoaId === pessoaId) : s.alertas;
  const grupos = agruparAlertas(alertas);
  const oficial = s.situacao === "oficial";
  const dias = s.cobertura.map((c) => c.data);
  const mm = String(s.mes).padStart(2, "0");

  return (
    <main className="mx-auto w-full max-w-[297mm] bg-white p-6 text-[10px] text-black print:p-0">
      <style>{`@page { size: A4 landscape; margin: 8mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } tr { break-inside: avoid; } .quebra { break-before: page; } } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`}</style>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Para PDF, escolha “Salvar como PDF” na janela de impressão (papel deitado).</p>
        <div className="flex gap-2">
          <Link href={`/escalas/simulacao/${s.lote}?filial=${s.branchId}&op=${s.id}`} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm">
            Voltar
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      <header className="mb-2 flex items-center gap-4 border-b border-gray-400 pb-2">
        <Image src="/marca/fct-emblema.png" alt="Farmácia do Trabalhador" width={56} height={50} className="h-auto" />
        <div className="flex-1">
          <h1 className="text-base font-bold">
            ESCALA 5x2 · {s.filial.codigo} {s.filial.nome} · {nomeMes(s.ano, s.mes).toUpperCase()}
          </h1>
          <p>
            Opção {s.opcao} · {s.jornadaSemanal} h/semana · folgas em {rotuloDias(s.folgasPermitidas)} · {textoFuncionamento(s.config)} · mínimo de {s.config.minimos.farmaceutico ?? 0} farmacêutico(s) por hora
          </p>
          {pessoaId && (
            <p className="font-semibold">
              Escala individual · {equipe[0].nome} · {ROTULO_FUNCAO[equipe[0].funcao]}
            </p>
          )}
        </div>
        <div className={`rounded border px-3 py-1 text-center font-bold ${oficial ? "border-emerald-700 text-emerald-800" : "border-red-700 text-red-700"}`}>
          {oficial ? "ESCALA OFICIAL" : s.situacao === "substituida" ? "SUBSTITUÍDA" : "RASCUNHO"}
        </div>
      </header>
      {!oficial && alertas.length > 0 && <p className="mb-2 font-semibold text-red-700">Rascunho para análise: há {alertas.length} pendência(s) de auditoria (lista no fim). Não publicar antes de revisar.</p>}

      <table className="w-full border-collapse [&_td]:border [&_td]:border-gray-300 [&_th]:border [&_th]:border-gray-300">
        <thead>
          <tr className="bg-[#123f35] text-white">
            <th className="w-40 px-1 py-0.5 text-left">Colaborador / função</th>
            {dias.map((d) => (
              <th key={d} className="px-0 py-0.5 text-center text-[8px] leading-tight font-medium">
                {d}
                <br />
                {ROTULO_DIA[diaChave(s.ano, s.mes, d)]}
              </th>
            ))}
            <th className="w-10 px-1 text-right">Horas</th>
          </tr>
        </thead>
        <tbody>
          {equipe.map((p) => (
            <tr key={p.id}>
              <td className="px-1 py-0.5 leading-tight">
                <b>{p.nome}</b>
                <br />
                <span className="text-[8px] text-gray-600">{ROTULO_FUNCAO[p.funcao]}</span>
              </td>
              {p.turnos.map((t) => (
                <td key={t.data} className="px-0 py-0.5 text-center text-[8px] tabular-nums" style={{ background: COR[t.status] }}>
                  {celula(t.status, t.inicio)}
                </td>
              ))}
              <td className="px-1 text-right tabular-nums">{p.totalHoras.toFixed(0)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[8px] text-gray-600">Hora = entrada · F folga · — loja fechada · A afastado · I inativo. Almoço e saída na próxima página.</p>

      <section className="quebra mt-4">
        <h2 className="mb-1 text-sm font-bold">TURNOS E RESUMO DE HORAS</h2>
        <div className="columns-2 gap-6">
          {equipe
            .filter((p) => p.turnos.some((t) => t.status === "trabalho"))
            .map((p) => (
              <table key={p.id} className="mb-3 w-full break-inside-avoid border-collapse [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-1 [&_th]:px-1 [&_th]:text-left">
                <thead>
                  <tr>
                    <th colSpan={6} className="bg-gray-100 py-0.5">
                      {p.nome} · {ROTULO_FUNCAO[p.funcao]} · {p.totalHoras.toFixed(1)} h no mês · média {p.mediaSemanal.toFixed(1)} h/semana{p.excedente ? ` · excedente ${p.excedente.toFixed(1)} h` : ""}
                    </th>
                  </tr>
                  <tr className="text-[8px] text-gray-600">
                    <th>Dia</th>
                    <th>Entrada</th>
                    <th>Almoço</th>
                    <th>Retorno</th>
                    <th>Saída</th>
                    <th className="!text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {p.turnos
                    .filter((t) => t.status === "trabalho")
                    .map((t) => (
                      <tr key={t.data} className="tabular-nums">
                        <td>
                          {String(t.data).padStart(2, "0")}/{mm} {ROTULO_DIA[t.dia]}
                          {t.ajustado ? " *" : ""}
                        </td>
                        <td>{t.inicio}</td>
                        <td>{t.intervaloInicio || "—"}</td>
                        <td>{t.intervaloFim || "—"}</td>
                        <td>{t.fim}</td>
                        <td className="text-right">{t.horas.toFixed(1)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ))}
        </div>
        <p className="text-[8px] text-gray-600">* ajuste manual.</p>
      </section>

      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-1 text-sm font-bold">
          AUDITORIA · {grupos.length} tipo(s) · {alertas.length} ocorrência(s)
        </h2>
        {grupos.length === 0 ? (
          <p>Nenhuma pendência nas regras e nos dados informados.</p>
        ) : (
          <ul className="space-y-1">
            {grupos.map((g, i) => (
              <li key={i} className="break-inside-avoid">
                <span className={g.severidade === "alta" ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>[{g.severidade === "alta" ? "alta" : "média"}]</span> {g.mensagem}
                <span className="block text-[8px] text-gray-600">
                  Datas: {datasTexto(g.datas, s.mes)}
                  {g.faixasTodas.length ? ` · faixas sem cobertura: ${g.faixasTodas.join(", ")}` : ""}
                </span>
                {g.sugestoesTodas.slice(0, 3).map((x, k) => (
                  <span key={k} className="block pl-3 text-[8px] text-gray-700">
                    Alternativa: {x}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-[8px] text-gray-600">
        Escala {mesCurto(s.ano, s.mes)} gerada pelo Sistema FCT. A auditoria depende do horário, da equipe e dos mínimos cadastrados; valide acordos coletivos, feriados e exigências do CRF com o RH. Impresso em{" "}
        {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
      </p>
    </main>
  );
}
