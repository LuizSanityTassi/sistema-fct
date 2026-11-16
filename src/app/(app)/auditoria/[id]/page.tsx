import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { contarRespostas, dataHoraBrasil, lerRespostas, numeroDoc, ROTULO_RESPOSTA, SO_RESPOSTA, type Resposta } from "@/lib/auditoria/checklist";
import { exigirAcesso } from "@/lib/auth/session";
import { obterChecklistAuditoria } from "@/lib/data/auditoria-lojas";
import { cancelarChecklistAuditoria } from "../actions";
import { CancelarAuditoria } from "../cancelar";

export const metadata = { title: "Checklist de auditoria" };

const COR: Record<Resposta, string> = {
  sim: "border-emerald-200 bg-emerald-50 text-emerald-800",
  nao: "border-red-200 bg-red-50 text-red-800",
  regular: "border-amber-200 bg-amber-50 text-amber-800",
  nao_utilizar: "border-slate-200 bg-slate-50 text-slate-700",
};

export default async function ChecklistAuditoriaPage({ params, searchParams }: PageProps<"/auditoria/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/auditoria"), params, searchParams]);
  const c = await obterChecklistAuditoria(id);
  if (!c) notFound();
  const respostas = lerRespostas(c.respostas);
  const cont = contarRespostas(respostas);
  const cancelado = c.situacao === "cancelado";
  const podeCancelar = !cancelado && (sessao.papel === "admin" || c.auditor_id === sessao.id);

  return (
    <>
      <PageHeader
        eyebrow={`Auditoria de lojas · Checklist nº ${numeroDoc(c.numero)}`}
        titulo={`${c.filial?.codigo ?? ""} — ${c.filial?.nome ?? ""}`}
        descricao="Verificação do cumprimento das normas das farmácias."
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/auditoria" />}>
              <ArrowLeft data-icon="inline-start" />
              Voltar
            </Button>
            <Button nativeButton={false} render={<Link href={`/imprimir/auditoria/${c.id}`} target="_blank" />}>
              <Printer data-icon="inline-start" />
              Imprimir / PDF
            </Button>
          </>
        }
      />
      {sp.novo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem={`Checklist nº ${numeroDoc(c.numero)} finalizado.`} />
        </div>
      )}

      <section className="mb-4 grid gap-3 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <p>
          <span className="rotulo block">Abertura</span>
          {dataHoraBrasil(c.aberto_em)}
        </p>
        <p>
          <span className="rotulo block">Finalização</span>
          {dataHoraBrasil(c.finalizado_em)}
        </p>
        <p>
          <span className="rotulo block">Situação</span>
          <Status tom={cancelado ? "neutro" : "sucesso"}>{cancelado ? "Cancelado" : "Finalizado"}</Status>
        </p>
        <p>
          <span className="rotulo block">Gerente</span>
          {c.gerente_nome ?? "—"}
        </p>
        <p>
          <span className="rotulo block">Auditor</span>
          {c.auditor_nome ?? "—"}
        </p>
        <p>
          <span className="rotulo block">Respostas</span>
          <span className="text-emerald-700">{cont.sim} Sim</span> · <span className="text-red-700">{cont.nao} Não</span> · <span className="text-amber-700">{cont.regular} Regular</span> · {cont.nao_utilizar} Não utilizar
        </p>
        {cancelado && (
          <p className="sm:col-span-2 lg:col-span-3 text-red-800">
            Cancelado em {dataHoraBrasil(c.cancelado_em)}: {c.motivo_cancelamento}
          </p>
        )}
      </section>

      <div className="space-y-3">
        {respostas.map((q) => {
          const unica = q.itens.length === 1 && q.itens[0].item === SO_RESPOSTA;
          return (
            <section key={q.n} className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
                <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{q.n}</span>
                {q.pergunta}
              </h2>
              <ul className="divide-y">
                {q.itens.map((i, k) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span>{unica ? "Resposta" : i.item}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${COR[i.resposta]}`}>{ROTULO_RESPOSTA[i.resposta]}</span>
                  </li>
                ))}
              </ul>
              {q.comentario && <p className="border-t px-4 py-2 text-xs text-muted-foreground">R: {q.comentario}</p>}
            </section>
          );
        })}
      </div>

      {(c.observacao || c.anotacoes) && (
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 text-sm">
            <p className="rotulo mb-1">Observação</p>
            <p className="whitespace-pre-line">{c.observacao || "—"}</p>
          </div>
          <div className="rounded-xl border bg-card p-5 text-sm">
            <p className="rotulo mb-1">Anotações extras</p>
            <p className="whitespace-pre-line">{c.anotacoes || "—"}</p>
          </div>
        </section>
      )}

      {podeCancelar && (
        <div className="mt-6">
          <CancelarAuditoria action={cancelarChecklistAuditoria.bind(null, c.id)} rotulo="Cancelar checklist" />
        </div>
      )}
    </>
  );
}
