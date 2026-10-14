"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoImportacaoRh } from "./actions";

type Props = { action: (prev: EstadoImportacaoRh, fd: FormData) => Promise<EstadoImportacaoRh>; competencia: string };

function Lista({ titulo, itens, tom = "neutro", vazio }: { titulo: string; itens: React.ReactNode[]; tom?: "neutro" | "alerta"; vazio?: string }) {
  if (!itens.length && !vazio) return null;
  return (
    <details className="rounded-lg border bg-background" open={itens.length > 0 && itens.length <= 15}>
      <summary className={`cursor-pointer px-3 py-2 text-sm font-medium ${tom === "alerta" && itens.length ? "text-amber-800" : ""}`}>
        {titulo} ({itens.length})
      </summary>
      {itens.length ? <ul className="max-h-72 space-y-1 overflow-auto border-t px-3 py-2 text-xs">{itens}</ul> : <p className="border-t px-3 py-2 text-xs text-muted-foreground">{vazio}</p>}
    </details>
  );
}

export function ImportarRhForm({ action, competencia }: Props) {
  const [estado, enviar, pendente] = useActionState(action, {});
  // envio manual: com <form action> o React limpa o formulário (e o arquivo) depois da prévia
  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    React.startTransition(() => enviar(fd));
  };
  const [temArquivo, setTemArquivo] = React.useState(false);
  const a = estado.analise;
  const aGravar = a ? a.novos + a.alterados : 0;

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Planilha do RH</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Baixe a planilha do Google em Excel (Arquivo → Fazer download → Microsoft Excel .xlsx) e escolha o mês. O sistema lê só as abas daquele mês: a de lançamentos (“VARELA 092026”: extras, adicional noturno, falta e reembolsos) e a de quebra de caixa (“QC Varela 092026”). O funcionário é encontrado pelo nome; o CPF da aba de quebra não é lido.
        </p>
        <ErroFormulario mensagem={estado.erro} />
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
          <Campo id="arquivo" label="Arquivo (.xlsx)" obrigatorio>
            <input
              id="arquivo"
              name="arquivo"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setTemArquivo((e.target.files?.length ?? 0) > 0)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-fct-navy file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-fct-navy/90"
            />
          </Campo>
          <Campo id="competencia" label="Competência" obrigatorio>
            <Input id="competencia" name="competencia" type="month" defaultValue={competencia} className="w-44" />
          </Campo>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button type="submit" name="etapa" value="analisar" variant="outline" disabled={pendente || !temArquivo}>
            <FileSpreadsheet data-icon="inline-start" />
            {pendente ? "Lendo…" : "Analisar (prévia)"}
          </Button>
          <span className="text-xs text-muted-foreground">Nada é gravado na prévia.</span>
        </div>
      </section>

      {estado.gravado && a && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Importado: {estado.gravado.valores} valor(es) e {estado.gravado.observacoes} observação(ões).{" "}
            <Link href={`/rh/lancamentos?competencia=${a.competencia}`} className="font-medium underline">
              Abrir os lançamentos
            </Link>
          </p>
        </div>
      )}

      {a && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Prévia · {a.arquivo}</h2>
            <span className="text-xs text-muted-foreground">Abas lidas: {a.abas.map((x) => `${x.nome} (${x.tipo === "quebra" ? "quebra de caixa" : "lançamentos"}, ${x.linhas})`).join(" · ")}</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { r: "Funcionários encontrados", v: a.encontrados },
              { r: "Valores novos", v: a.novos },
              { r: "Valores alterados", v: a.alterados, alerta: a.alterados > 0 },
              { r: "Já iguais no sistema", v: a.iguais },
              { r: "Nomes não encontrados", v: a.naoEncontrados.length + a.ambiguos.length, alerta: a.naoEncontrados.length + a.ambiguos.length > 0 },
            ].map((k) => (
              <div key={k.r} className="rounded-lg border bg-background px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{k.r}</dt>
                <dd className={`text-lg font-semibold tabular-nums ${k.alerta ? "text-amber-700" : ""}`}>{k.v}</dd>
              </div>
            ))}
          </dl>
          {a.porEvento.length > 0 && <p className="text-xs text-muted-foreground">Por evento: {a.porEvento.map((p) => `${p.nome} ${p.qtd}`).join(" · ")}</p>}
          {a.foraDaPlanilha.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {a.foraDaPlanilha.map((f) => `${f.evento}: ${f.qtd}`).join(", ")} — são gravados, mas não saem na planilha da contabilidade enquanto o evento não tiver o código da Domínio (Configurar).
            </p>
          )}

          <Lista
            titulo="Valores para conferir"
            tom="alerta"
            itens={a.avisos.map((x, i) => (
              <li key={i}>
                <strong>{x.nome}</strong> · {x.evento}: “{x.original}” → {x.lido} — {x.aviso}
              </li>
            ))}
          />
          <Lista
            titulo="Nomes encontrados por semelhança (confira se é a mesma pessoa)"
            tom="alerta"
            itens={a.parecidos.map((x, i) => (
              <li key={i}>
                {x.planilha} → <strong>{x.cadastro}</strong>
              </li>
            ))}
          />
          <Lista
            titulo="Nomes da planilha que não estão no cadastro de funcionários (ficam de fora: cadastre e importe de novo)"
            tom="alerta"
            itens={[...a.naoEncontrados, ...a.ambiguos].map((x, i) => (
              <li key={i}>
                {x.nome} <span className="text-muted-foreground">· {x.aba}, linha {x.linha}{a.ambiguos.includes(x) ? " · nome repetido no cadastro" : ""}</span>
              </li>
            ))}
          />
          <Lista
            titulo="Valores que mudam o que já está no sistema"
            tom="alerta"
            itens={a.alteracoes.map((x, i) => (
              <li key={i}>
                <strong>{x.nome}</strong> · {x.evento}: {x.antes} → {x.depois}
              </li>
            ))}
          />
          <Lista
            titulo="Quebra de caixa de farmacêutico ignorada (farmacêutico não tem quebra de caixa)"
            itens={a.quebraFarmaceuticos.map((x, i) => (
              <li key={i}>
                {x.nome}: R$ {x.valor}
              </li>
            ))}
          />
          <Lista
            titulo="Repetidos na planilha (ficou o primeiro)"
            tom="alerta"
            itens={a.duplicados.map((x, i) => (
              <li key={i}>
                {x.nome} · {x.evento}
              </li>
            ))}
          />
          {a.abasIgnoradas.length > 0 && <p className="text-xs text-muted-foreground">Abas ignoradas: {a.abasIgnoradas.join(", ")}</p>}
          <p className="text-xs text-muted-foreground">
            {a.observacoes} funcionário(s) recebem observação no mês (falta a apurar, reembolso, valor a conferir). Valores que já estão no sistema e não aparecem na planilha continuam como estão.
          </p>

          {!estado.gravado && (
            <div className="flex items-center gap-2 border-t pt-3">
              <Button type="submit" name="etapa" value="gravar" disabled={pendente || !temArquivo || (aGravar === 0 && a.observacoes === 0)}>
                <Upload data-icon="inline-start" />
                {pendente ? "Gravando…" : `Gravar ${aGravar} valor(es)`}
              </Button>
              <span className="text-xs text-muted-foreground">O arquivo escolhido acima é lido de novo ao gravar.</span>
            </div>
          )}
        </section>
      )}
    </form>
  );
}
