import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/app/etiquetas/ti/imprimir";
import { dataHoraBrasil, lerRespostas, numeroDoc, RESPOSTAS, ROTULO_RESPOSTA, SO_RESPOSTA } from "@/lib/auditoria/checklist";
import { getSessao } from "@/lib/auth/session";
import { obterChecklistAuditoria } from "@/lib/data/auditoria-lojas";

export const metadata: Metadata = { title: "Checklist de auditoria" };

/** O checklist no formato do papel (para imprimir ou salvar em PDF), fora do layout do sistema. */
export default async function ImprimirChecklistAuditoriaPage({ params }: PageProps<"/imprimir/auditoria/[id]">) {
  const [, { id }] = await Promise.all([getSessao(), params]);
  const c = await obterChecklistAuditoria(id);
  if (!c) notFound();
  const respostas = lerRespostas(c.respostas);
  const f = c.filial;
  const endereco = [f?.endereco, f?.cidade && `${f.cidade}${f.estado ? `/${f.estado}` : ""}`].filter(Boolean).join(" - ");

  return (
    <main className="mx-auto w-full max-w-[210mm] bg-white p-6 text-[11px] text-black print:p-0">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { .nao-imprimir { display: none !important; } body { background: #fff; } tr, .pergunta { break-inside: avoid; } }`}</style>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Para PDF, escolha “Salvar como PDF” na janela de impressão.</p>
        <div className="flex gap-2">
          <Link href={`/auditoria/${c.id}`} className="inline-flex h-9 items-center rounded-lg border px-3 text-sm">
            Voltar
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      <header className="grid grid-cols-[7rem_1fr_9rem] border border-gray-400">
        <div className="flex items-center justify-center border-r border-gray-400 p-2">
          <Image src="/marca/fct-emblema.png" alt="Farmácia do Trabalhador" width={90} height={80} className="h-auto" />
        </div>
        <div className="p-2 text-center leading-snug">
          <p className="font-semibold">{f?.razao_social ?? "—"}</p>
          {f?.cnpj && (
            <p>
              <strong>CNPJ:</strong> {f.cnpj}
            </p>
          )}
          {endereco && <p className="uppercase">{endereco}</p>}
        </div>
        <div className="grid grid-rows-2 border-l border-gray-400 text-center">
          <p className="flex items-center justify-center border-b border-gray-400 bg-gray-100 font-semibold">CHECKLIST</p>
          <p className="flex items-center justify-center font-semibold">{numeroDoc(c.numero)}</p>
        </div>
      </header>

      <h1 className="my-5 text-center text-xs font-bold uppercase">
        Checklist
        <br />
        Verificação do cumprimento das normas das farmácias.
      </h1>
      {c.situacao === "cancelado" && <p className="mb-3 border border-red-400 p-2 text-center font-semibold text-red-700">CANCELADO em {dataHoraBrasil(c.cancelado_em)}: {c.motivo_cancelamento}</p>}

      <table className="mb-4 w-full border-collapse [&_td]:border [&_td]:border-gray-400 [&_td]:px-1.5 [&_td]:py-0.5">
        <tbody>
          <tr>
            <td colSpan={2}>
              <strong>Cliente:</strong> {f?.razao_social ?? "—"}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <strong>Filial:</strong> {f?.codigo} - {f?.nome}
              {f?.cnpj ? ` - ${f.cnpj}` : ""}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Data/Hora de Abertura:</strong> {dataHoraBrasil(c.aberto_em)}
            </td>
            <td>
              <strong>Data/Hora de Finalização:</strong> {dataHoraBrasil(c.finalizado_em)}
            </td>
          </tr>
          <tr>
            <td>
              <strong>Gerente:</strong> <span className="uppercase">{c.gerente_nome ?? "—"}</span>
            </td>
            <td>
              <strong>Auditor:</strong> <span className="uppercase">{c.auditor_nome ?? "—"}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse [&_td]:border [&_td]:border-gray-400 [&_td]:px-1.5 [&_td]:py-0.5">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-14" />
          <col className="w-14" />
          <col className="w-16" />
          <col className="w-16" />
        </colgroup>
        {respostas.map((q) => {
          const unica = q.itens.length === 1 && q.itens[0].item === SO_RESPOSTA;
          return (
            <tbody key={q.n} className="pergunta">
              <tr className="font-bold">
                <td className="text-center">{q.n}</td>
                <td className="uppercase">{q.pergunta}</td>
                {RESPOSTAS.map((r) => (
                  <td key={r} className="text-center text-[10px] leading-tight uppercase">
                    {ROTULO_RESPOSTA[r]}
                  </td>
                ))}
              </tr>
              {q.itens.map((i, k) => (
                <tr key={k}>
                  <td />
                  <td className="uppercase">{unica ? `R: ${q.comentario ?? ""}` : i.item}</td>
                  {RESPOSTAS.map((r) => (
                    <td key={r} className="text-center text-sm">
                      {i.resposta === r ? "✓" : ""}
                    </td>
                  ))}
                </tr>
              ))}
              {!unica && q.comentario && (
                <tr>
                  <td />
                  <td colSpan={5}>R: {q.comentario}</td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>

      <div className="mt-4 space-y-2">
        <p>
          <strong>Observação:</strong> <span className="whitespace-pre-line">{c.observacao ?? ""}</span>
        </p>
        <p>
          <strong>Anotações extras:</strong> <span className="whitespace-pre-line">{c.anotacoes ?? ""}</span>
        </p>
      </div>

      <div className="mt-14 grid grid-cols-2 gap-10 text-center">
        <p className="border-t border-gray-500 pt-1">Gerente</p>
        <p className="border-t border-gray-500 pt-1">Auditor</p>
      </div>
      <p className="mt-6 text-right text-[10px] text-gray-600">Impresso em: {dataHoraBrasil(new Date().toISOString())}</p>
    </main>
  );
}
