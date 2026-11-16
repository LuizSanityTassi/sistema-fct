"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { CheckCheck, Send } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { campoComentario, campoItem, dataHoraBrasil, ehResposta, PERGUNTAS_CHECKLIST, RESPOSTAS, ROTULO_CURTO, ROTULO_RESPOSTA, SO_RESPOSTA, type Resposta } from "@/lib/auditoria/checklist";
import { salvarChecklistAuditoria } from "../actions";

type Loja = { id: string; codigo: string; nome: string; cnpj: string | null; gerente: string | null };
type Props = { lojas: Loja[]; auditor: string; usuarioId: string; agora: string };

type Rascunho = { loja: string; gerente: string; abertoEm: string; respostas: Record<string, Resposta>; comentarios: Record<string, string>; observacao: string; anotacoes: string };

const AREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const COR: Record<Resposta, string> = {
  sim: "peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white",
  nao: "peer-checked:border-red-600 peer-checked:bg-red-600 peer-checked:text-white",
  regular: "peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white",
  nao_utilizar: "peer-checked:border-slate-500 peer-checked:bg-slate-500 peer-checked:text-white",
};

const TOTAL_ITENS = PERGUNTAS_CHECKLIST.reduce((s, q) => s + q.itens.length, 0);

/** Checklist de verificação das normas das farmácias (o papel do auditor), com rascunho salvo no aparelho. */
export function ChecklistAuditoriaForm({ lojas, auditor, usuarioId, agora }: Props) {
  const router = useRouter();
  const chave = `fct.auditoria.checklist.${usuarioId}`;
  const [erro, setErro] = React.useState<string | null>(null);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [loja, setLoja] = React.useState(lojas.length === 1 ? lojas[0].id : "");
  const [gerente, setGerente] = React.useState(lojas.length === 1 ? (lojas[0].gerente ?? "") : "");
  const [abertoEm, setAbertoEm] = React.useState(agora);
  const [respostas, setRespostas] = React.useState<Record<string, Resposta>>({});
  const [comentarios, setComentarios] = React.useState<Record<string, string>>({});
  const [observacao, setObservacao] = React.useState("");
  const [anotacoes, setAnotacoes] = React.useState("");
  const [restaurado, setRestaurado] = React.useState(false);
  const carregou = React.useRef(false);

  // rascunho: se fechar a página no meio da visita, continua de onde parou (só neste aparelho)
  React.useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(chave) ?? "null") as Rascunho | null;
      if (r && typeof r === "object" && Date.now() - Date.parse(r.abertoEm) < 2 * 86_400_000) {
        /* eslint-disable react-hooks/set-state-in-effect -- restaura o rascunho uma vez, depois de montar */
        if (lojas.some((l) => l.id === r.loja)) setLoja(r.loja);
        setGerente(r.gerente ?? "");
        setAbertoEm(r.abertoEm);
        setRespostas(Object.fromEntries(Object.entries(r.respostas ?? {}).filter(([, v]) => ehResposta(v))));
        setComentarios(r.comentarios ?? {});
        setObservacao(r.observacao ?? "");
        setAnotacoes(r.anotacoes ?? "");
        if (Object.keys(r.respostas ?? {}).length) setRestaurado(true);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* sem armazenamento no aparelho: segue sem rascunho */
    }
    carregou.current = true;
  }, [chave, lojas]);

  React.useEffect(() => {
    if (!carregou.current) return;
    try {
      localStorage.setItem(chave, JSON.stringify({ loja, gerente, abertoEm, respostas, comentarios, observacao, anotacoes } satisfies Rascunho));
    } catch {
      /* ignora */
    }
  }, [chave, loja, gerente, abertoEm, respostas, comentarios, observacao, anotacoes]);

  const descartar = () => {
    try {
      localStorage.removeItem(chave);
    } catch {
      /* ignora */
    }
    setRespostas({});
    setComentarios({});
    setObservacao("");
    setAnotacoes("");
    setAbertoEm(new Date().toISOString());
    setRestaurado(false);
  };

  const trocarLoja = (id: string) => {
    setLoja(id);
    setGerente(lojas.find((l) => l.id === id)?.gerente ?? "");
  };
  const responder = (campo: string, r: Resposta) => setRespostas((a) => ({ ...a, [campo]: r }));
  const tudo = (n: number, qtd: number, r: Resposta) => setRespostas((a) => ({ ...a, ...Object.fromEntries(Array.from({ length: qtd }, (_, i) => [campoItem(n, i), r])) }));
  const respondidos = Object.keys(respostas).length;
  const lojaEscolhida = lojas.find((l) => l.id === loja);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro(null);
    setErros({});
    setEnviando(true);
    const r = await salvarChecklistAuditoria({}, new FormData(e.currentTarget));
    if (r.id) {
      try {
        localStorage.removeItem(chave);
      } catch {
        /* ignora */
      }
      router.push(`/auditoria/${r.id}?novo=1`);
      return;
    }
    setEnviando(false);
    setErro(r.erro ?? "Não consegui gravar.");
    setErros(r.erros ?? {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <ErroFormulario mensagem={erro ?? undefined} />
      {erros.respostas && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">
          {erros.respostas}
        </p>
      )}
      {restaurado && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>Continuando o checklist que ficou aberto neste aparelho (aberto em {dataHoraBrasil(abertoEm)}).</span>
          <Button type="button" size="sm" variant="ghost" onClick={descartar}>
            Começar de novo
          </Button>
        </div>
      )}
      <input type="hidden" name="aberto_em" value={abertoEm} />

      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="branch_id" label="Filial" obrigatorio erro={erros.branch_id}>
            <SelectNativo id="branch_id" name="branch_id" value={loja} onChange={(e) => trocarLoja(e.target.value)} aria-invalid={!!erros.branch_id}>
              {lojas.length !== 1 && <option value="">Selecione uma filial</option>}
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="gerente_nome" label="Gerente" dica="Vem do cadastro da filial; corrija se for outra pessoa">
            <Input id="gerente_nome" name="gerente_nome" value={gerente} onChange={(e) => setGerente(e.target.value)} maxLength={120} />
          </Campo>
          <Campo id="auditor" label="Auditor">
            <Input id="auditor" value={auditor} readOnly disabled />
          </Campo>
          <Campo id="abertura" label="Data/hora de abertura">
            <Input id="abertura" value={dataHoraBrasil(abertoEm)} readOnly disabled />
          </Campo>
        </div>
        {lojaEscolhida?.cnpj && <p className="mt-3 text-xs text-muted-foreground">CNPJ da filial: {lojaEscolhida.cnpj}</p>}
      </section>

      <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border bg-card/95 px-4 py-2 text-sm shadow-sm backdrop-blur">
        <span>
          <strong className="tabular-nums">{respondidos}</strong> de <span className="tabular-nums">{TOTAL_ITENS}</span> itens respondidos
        </span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((respondidos / TOTAL_ITENS) * 100)}%` }} />
        </div>
      </div>

      {PERGUNTAS_CHECKLIST.map((q) => {
        const faltam = q.itens.filter((_, i) => !respostas[campoItem(q.n, i)]).length;
        const unica = q.itens.length === 1 && q.itens[0] === SO_RESPOSTA;
        return (
          <section key={q.n} className={`rounded-xl border bg-card ${erros.respostas && faltam ? "border-red-300" : ""}`}>
            <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">
                <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{q.n}</span>
                {q.pergunta}
              </h2>
              {q.itens.length > 1 && (
                <Button type="button" size="xs" variant="ghost" onClick={() => tudo(q.n, q.itens.length, "sim")}>
                  <CheckCheck data-icon="inline-start" />
                  Tudo Sim
                </Button>
              )}
            </header>
            <ul className="divide-y">
              {q.itens.map((item, i) => {
                const campo = campoItem(q.n, i);
                return (
                  <li key={campo} className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
                    <span className="text-sm">{unica ? "Resposta" : item}</span>
                    <div role="radiogroup" aria-label={unica ? q.pergunta : `${q.pergunta} — ${item}`} className="grid grid-cols-4 gap-1.5 md:w-[23rem]">
                      {RESPOSTAS.map((r) => (
                        <label key={r} className="cursor-pointer">
                          <input type="radio" name={campo} value={r} checked={respostas[campo] === r} onChange={() => responder(campo, r)} className="peer sr-only" />
                          <span
                            title={ROTULO_RESPOSTA[r]}
                            className={`flex h-9 items-center justify-center rounded-md border text-xs font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 hover:bg-muted ${COR[r]}`}
                          >
                            {ROTULO_CURTO[r]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t px-4 py-2">
              <Input
                name={campoComentario(q.n)}
                value={comentarios[q.n] ?? ""}
                onChange={(e) => setComentarios((c) => ({ ...c, [q.n]: e.target.value }))}
                maxLength={500}
                placeholder={unica ? "R: (opcional)" : "Comentário (opcional)"}
                aria-label={`Comentário da pergunta ${q.n}`}
                className="h-8 text-xs"
              />
            </div>
          </section>
        );
      })}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <label htmlFor="observacao" className="text-sm font-semibold">
            Observação
          </label>
          <textarea id="observacao" name="observacao" rows={4} maxLength={4000} className={`${AREA} mt-2`} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <label htmlFor="anotacoes" className="text-sm font-semibold">
            Anotações extras
          </label>
          <textarea id="anotacoes" name="anotacoes" rows={4} maxLength={4000} className={`${AREA} mt-2`} value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={enviando}>
          <Send data-icon="inline-start" />
          {enviando ? "Gravando…" : "Finalizar checklist"}
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/auditoria" />} disabled={enviando}>
          Voltar
        </Button>
        {respondidos < TOTAL_ITENS && <span className="text-xs text-muted-foreground">Faltam {TOTAL_ITENS - respondidos} itens.</span>}
      </div>
    </form>
  );
}
