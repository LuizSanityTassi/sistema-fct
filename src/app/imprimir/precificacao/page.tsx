import type { Metadata } from "next";
import Link from "next/link";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { dataBrasil, dataHoraBrasil, formatarTaxa, taxaDivergencia } from "@/lib/auditoria/checklist";
import { getSessao } from "@/lib/auth/session";
import { lerFiltrosAuditoria, lojasAuditaveis, relatorioPrecificacao } from "@/lib/data/auditoria-lojas";
import { formatarMoeda } from "@/lib/formatos";

export const metadata: Metadata = { title: "Relatório de auditoria de precificação" };

/** Relatório da auditoria de precificação (por regional, por filial ou de uma auditoria), para imprimir ou salvar em PDF. */
export default async function ImprimirPrecificacaoPage({ searchParams }: PageProps<"/imprimir/precificacao">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  const filtros = lerFiltrosAuditoria(sp);
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const [auditorias, lojas] = await Promise.all([relatorioPrecificacao(filtros, id), id ? Promise.resolve([]) : lojasAuditaveis()]);
  const dias = Math.round((Date.parse(filtros.ate) - Date.parse(filtros.de)) / 86_400_000) + 1;
  const semanal = !id && dias <= 7;
  const recorte = id
    ? null
    : filtros.modo === "filial" && filtros.filial
      ? (() => {
          const l = lojas.find((x) => x.id === filtros.filial);
          return l ? `Filial ${l.codigo} - ${l.nome}` : "Filial";
        })()
      : filtros.regional
        ? `Regional ${filtros.regional}`
        : "Todas as regionais";
  const totVer = auditorias.reduce((s, a) => s + (a.qtd_verificada ?? 0), 0);
  const totDiv = auditorias.reduce((s, a) => s + (a.qtd_divergente ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-[210mm] bg-white p-6 text-[12px] text-black print:p-0">
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } tr, .bloco-cab { break-inside: avoid; } }`}</style>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Para PDF, escolha “Salvar como PDF” na janela de impressão.</p>
        <div className="flex gap-2">
          <Link href={id ? `/auditoria/precificacao/${id}` : "/auditoria/precificacao"} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm">
            Voltar
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      <h1 className="text-center text-lg font-bold">{semanal ? "RELATÓRIO SEMANAL" : "RELATÓRIO"} — AUDITORIA DE PRECIFICAÇÃO</h1>
      {recorte && (
        <p className="mb-1 text-center text-gray-700">
          {recorte} · de {dataBrasil(`${filtros.de}T12:00:00-03:00`)} até {dataBrasil(`${filtros.ate}T12:00:00-03:00`)}
        </p>
      )}
      <p className="mb-6 text-center text-[10px] text-gray-500">
        Emitido em {dataHoraBrasil(new Date().toISOString())} por {sessao.nome}
      </p>

      {auditorias.length === 0 && <p className="text-center">Nenhuma auditoria de precificação finalizada neste período.</p>}

      {!id && auditorias.length > 1 && (
        <table className="mb-8 w-full border-collapse [&_td]:border-b [&_td]:py-1 [&_th]:border-b-2 [&_th]:py-1 [&_th]:text-left">
          <thead>
            <tr>
              <th>Filial</th>
              <th>Data</th>
              <th className="!text-right">Verificados</th>
              <th className="!text-right">Divergências</th>
              <th className="!text-right">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {auditorias.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.filial?.codigo} - {a.filial?.nome}
                </td>
                <td>{dataBrasil(a.finalizado_em)}</td>
                <td className="text-right tabular-nums">{a.qtd_verificada}</td>
                <td className="text-right tabular-nums">{a.qtd_divergente}</td>
                <td className="text-right tabular-nums">{formatarTaxa(taxaDivergencia(a.qtd_divergente, a.qtd_verificada))}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={2}>Total</td>
              <td className="text-right tabular-nums">{totVer}</td>
              <td className="text-right tabular-nums">{totDiv}</td>
              <td className="text-right tabular-nums">{formatarTaxa(taxaDivergencia(totDiv, totVer))}</td>
            </tr>
          </tbody>
        </table>
      )}

      {auditorias.map((a) => (
        <section key={a.id} className="mb-8">
          <div className="bloco-cab">
            <h2 className="mb-2 text-base font-bold">
              {a.filial?.codigo} - {a.filial?.nome}
            </h2>
            <div className="mb-3 space-y-0.5">
              <p>
                <strong>Auditor responsável:</strong> <span className="uppercase">{a.auditor_nome ?? "—"}</span>
              </p>
              <p>
                <strong>Data:</strong> {dataHoraBrasil(a.finalizado_em)}
              </p>
              <p>
                <strong>Produtos verificados:</strong> {a.qtd_verificada}
              </p>
              <p>
                <strong>Divergências encontradas:</strong> {a.qtd_divergente}
              </p>
              <p>
                <strong>Taxa de divergência:</strong> {formatarTaxa(taxaDivergencia(a.qtd_divergente, a.qtd_verificada))}
              </p>
              <p>
                <strong>Observação:</strong> {a.observacao ?? ""}
              </p>
            </div>
          </div>
          {a.itens.length > 0 && (
            <table className="w-full border-collapse [&_td]:py-0.5 [&_th]:py-1 [&_th]:text-left">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="!text-right">Etiqueta</th>
                  <th className="!text-right">Sistema</th>
                  <th className="!text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {a.itens.map((i, k) => (
                  <tr key={k}>
                    <td className="pr-3 uppercase">
                      {i.codigo} - {i.produto}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.valor_etiqueta)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.valor_sistema)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.diferenca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </main>
  );
}
