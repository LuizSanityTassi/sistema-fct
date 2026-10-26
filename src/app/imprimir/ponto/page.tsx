import type { Metadata } from "next";
import Link from "next/link";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { getSessao } from "@/lib/auth/session";
import { lerParamsRelatorioPonto, montarRelatorioPonto } from "@/lib/data/ponto-relatorios";
import { formatarData, formatarDataHora } from "@/lib/formatos";

export const metadata: Metadata = { title: "Relatório do ponto" };

/**
 * Versão para imprimir / salvar em PDF dos relatórios do ponto (fora do layout do sistema). Mesmos parâmetros da
 * exportação; o espelho sai uma página por funcionário, com campo de assinatura.
 */
export default async function ImprimirPontoPage({ searchParams }: PageProps<"/imprimir/ponto">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  const p = lerParamsRelatorioPonto(sp);
  const { titulo, relatorios } = await montarRelatorioPonto(sessao, p);
  const espelho = p.relatorio === "espelho";
  const voltar = espelho ? `/ponto/espelho?mes=${p.mes}${p.funcionario ? `&funcionario=${p.funcionario}` : ""}` : `/ponto/relatorios?${new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])}`;

  return (
    <main className="mx-auto w-full max-w-[297mm] p-6 text-[11px] print:p-0">
      <style>{`@page { size: A4 ${espelho ? "portrait" : "landscape"}; margin: 10mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } .quebra { break-after: page; } }`}</style>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">Para PDF, escolha “Salvar como PDF” na janela de impressão.</p>
        </div>
        <div className="flex gap-2">
          <Link href={voltar} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm">
            Voltar
          </Link>
          <BotaoImprimir />
        </div>
      </div>
      {relatorios.length === 0 && <p className="text-sm">Sem dados para este filtro.</p>}
      {relatorios.map((r, i) => (
        <section key={i} className={i < relatorios.length - 1 ? "quebra mb-8" : ""}>
          <header className="mb-2 flex items-end justify-between gap-4 border-b pb-1.5">
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Sistema FCT · Controle de ponto</p>
              <h2 className="text-sm font-semibold">{r.titulo}</h2>
            </div>
            <p className="text-right text-[10px] text-muted-foreground">
              Emitido em {formatarDataHora(new Date().toISOString())}
              <br />
              por {sessao.nome}
            </p>
          </header>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {r.colunas.map((c) => (
                  <th key={c.chave} className="border-b px-1 py-1 text-left font-semibold whitespace-nowrap">
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.linhas.map((l, j) => (
                <tr key={j} className="border-b border-dashed">
                  {r.colunas.map((c) => (
                    <td key={c.chave} className="px-1 py-0.5 align-top tabular-nums">
                      {c.tipo === "data" && typeof l[c.chave] === "string" ? formatarData(l[c.chave] as string) : (l[c.chave] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {r.totais && (
              <tfoot>
                <tr className="font-semibold">
                  {r.colunas.map((c) => (
                    <td key={c.chave} className="border-t px-1 py-1 tabular-nums">
                      {r.totais![c.chave] ?? ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          {espelho && (
            <div className="mt-10 grid grid-cols-2 gap-12 text-center text-[10px]">
              <p className="border-t pt-1">Assinatura do funcionário</p>
              <p className="border-t pt-1">Assinatura do gestor</p>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
