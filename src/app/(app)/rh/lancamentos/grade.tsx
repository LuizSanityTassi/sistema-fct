"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Download, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarValorGrade, lerValorDigitado } from "@/lib/rh/lancamentos";
import { cn } from "@/lib/utils";
import { salvarLancamentos, type AlteracaoObs, type AlteracaoValor } from "./actions";

export type EventoGrade = { id: string; nome: string; codigo: number | null; unidade: "horas" | "valor"; naPlanilha: boolean };
export type FuncionarioGrade = {
  id: string;
  nome: string;
  matricula: string | null;
  funcao: string;
  ativoNoMes: boolean;
  valores: Record<string, number>;
  obs: { texto: string; pendente: boolean } | null;
};
export type GrupoGrade = {
  filial: { id: string; codigo: string; nome: string; cnpj: string | null; codigoDominio: number | null; arquivo: string };
  funcionarios: FuncionarioGrade[];
};

type Props = { competencia: string; eventos: EventoGrade[]; grupos: GrupoGrade[]; versao: string };

type Registrar = (chave: string, valor: string | null) => void;

/** Célula de valor: guarda o texto digitado e avisa a grade quando difere do gravado. */
const Celula = React.memo(function Celula({ chave, inicial, linha, coluna, registrar, rotulo }: { chave: string; inicial: number | undefined; linha: number; coluna: number; registrar: Registrar; rotulo: string }) {
  const original = inicial ? formatarValorGrade(inicial) : "";
  const [estado, setEstado] = React.useState<"igual" | "alterado" | "invalido">("igual");
  return (
    <input
      type="text"
      inputMode="decimal"
      defaultValue={original}
      aria-label={rotulo}
      data-r={linha}
      data-c={coluna}
      onChange={(e) => {
        const t = e.target.value;
        const n = lerValorDigitado(t);
        if (Number.isNaN(n)) {
          setEstado("invalido");
          registrar(chave, "#invalido");
          return;
        }
        const mudou = (n ?? 0) !== (inicial ?? 0);
        setEstado(mudou ? "alterado" : "igual");
        registrar(chave, mudou ? (n === null ? "" : String(n)) : null);
      }}
      className={cn(
        "h-8 w-[5.5rem] rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums outline-none hover:border-border focus:border-fct-navy focus:bg-background",
        estado === "alterado" && "border-amber-300 bg-amber-50",
        estado === "invalido" && "border-red-500 bg-red-50",
      )}
    />
  );
});

const CelulaObs = React.memo(function CelulaObs({ funcionario, registrar, linha, coluna }: { funcionario: FuncionarioGrade; registrar: Registrar; linha: number; coluna: number }) {
  const inicial = funcionario.obs;
  const [texto, setTexto] = React.useState(inicial?.texto ?? "");
  const [pendente, setPendente] = React.useState(inicial?.pendente ?? false);
  const atualizar = (t: string, p: boolean) => {
    const mudou = t.trim() !== (inicial?.texto ?? "") || (t.trim() !== "" && p !== (inicial?.pendente ?? false));
    registrar(`obs|${funcionario.id}`, mudou ? JSON.stringify({ texto: t, pendente: p }) : null);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={texto}
        maxLength={2000}
        title={texto}
        placeholder="—"
        aria-label={`Observação de ${funcionario.nome}`}
        data-r={linha}
        data-c={coluna}
        onChange={(e) => {
          const t = e.target.value;
          const p = !inicial && t.trim() && !texto.trim() ? true : pendente;
          setTexto(t);
          setPendente(p);
          atualizar(t, p);
        }}
        className={cn(
          "h-8 w-64 rounded-md border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-border focus:border-fct-navy focus:bg-background",
          pendente && texto.trim() && "text-amber-900",
        )}
      />
      {texto.trim() && (
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Marque enquanto precisar de ação (ex.: falta a apurar)">
          <input
            type="checkbox"
            checked={pendente}
            onChange={(e) => {
              setPendente(e.target.checked);
              atualizar(texto, e.target.checked);
            }}
          />
          pendente
        </label>
      )}
    </div>
  );
});

const Linha = React.memo(function Linha({ f, eventos, linha, registrar }: { f: FuncionarioGrade; eventos: EventoGrade[]; linha: number; registrar: Registrar }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="sticky left-0 z-10 min-w-64 max-w-72 bg-card px-3 py-1">
        <div className="truncate text-sm font-medium" title={f.nome}>
          {f.nome}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {f.matricula ? `Matr. ${f.matricula}` : "sem matrícula"} · {f.funcao || "—"}
          {!f.ativoNoMes && <span className="ml-1 text-amber-700">· fora do mês</span>}
        </div>
      </td>
      {eventos.map((e, c) => (
        <td key={e.id} className="px-1 py-1">
          <Celula chave={`${f.id}|${e.id}`} inicial={f.valores[e.id]} linha={linha} coluna={c} registrar={registrar} rotulo={`${e.nome} de ${f.nome}`} />
        </td>
      ))}
      <td className="px-2 py-1">
        <CelulaObs funcionario={f} registrar={registrar} linha={linha} coluna={eventos.length} />
      </td>
    </tr>
  );
});

export function GradeLancamentos({ competencia, eventos, grupos, versao }: Props) {
  const router = useRouter();
  const alteracoes = React.useRef(new Map<string, string>());
  const [qtd, setQtd] = React.useState(0);
  const [invalidas, setInvalidas] = React.useState(0);
  const [chaveTabela, setChaveTabela] = React.useState(0);
  const [msg, setMsg] = React.useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, startSalvar] = React.useTransition();

  // remonta a grade quando o servidor devolve dados novos (depois de salvar)
  const versaoAnterior = React.useRef(versao);
  React.useEffect(() => {
    if (versaoAnterior.current === versao) return;
    versaoAnterior.current = versao;
    alteracoes.current.clear();
    setQtd(0);
    setInvalidas(0);
    setChaveTabela((k) => k + 1);
  }, [versao]);

  React.useEffect(() => {
    if (qtd === 0) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [qtd]);

  const registrar = React.useCallback<Registrar>((chave, valor) => {
    if (valor === null) alteracoes.current.delete(chave);
    else alteracoes.current.set(chave, valor);
    setQtd(alteracoes.current.size);
    setInvalidas([...alteracoes.current.values()].filter((v) => v === "#invalido").length);
  }, []);

  const descartar = () => {
    alteracoes.current.clear();
    setQtd(0);
    setInvalidas(0);
    setMsg(null);
    setChaveTabela((k) => k + 1);
  };

  const salvar = () => {
    const valores: AlteracaoValor[] = [];
    const observacoes: AlteracaoObs[] = [];
    for (const [chave, v] of alteracoes.current) {
      if (chave.startsWith("obs|")) {
        const o = JSON.parse(v) as { texto: string; pendente: boolean };
        observacoes.push({ employeeId: chave.slice(4), texto: o.texto, pendente: o.pendente });
      } else {
        const [employeeId, eventoId] = chave.split("|");
        valores.push({ employeeId, eventoId, valor: v === "" ? null : Number(v) });
      }
    }
    startSalvar(async () => {
      const r = await salvarLancamentos(competencia, valores, observacoes);
      if (!r.ok) {
        setMsg({ ok: false, texto: r.erro });
        return;
      }
      setMsg({ ok: true, texto: `Salvo: ${r.gravados} valor(es) gravado(s), ${r.apagados} apagado(s), ${r.observacoes} observação(ões).` });
      router.refresh();
    });
  };

  // Enter / setas ↑↓ andam na mesma coluna
  const navegar = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const alvo = e.target as HTMLInputElement;
    if (alvo.tagName !== "INPUT" || alvo.type === "checkbox" || !["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const r = Number(alvo.dataset.r);
    const c = alvo.dataset.c;
    const prox = e.currentTarget.querySelector<HTMLInputElement>(`input[data-r="${e.key === "ArrowUp" ? r - 1 : r + 1}"][data-c="${c}"]`);
    if (prox) {
      e.preventDefault();
      prox.focus();
      prox.select();
    }
  };

  let indice = 0;
  const total = grupos.reduce((s, g) => s + g.funcionarios.length, 0);

  return (
    <div className="rounded-xl border bg-card">
      <div className="max-h-[70vh] overflow-auto">
        <table key={chaveTabela} className="w-max min-w-full border-collapse text-sm" onKeyDown={navegar}>
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b text-left text-xs">
              <th className="sticky left-0 z-30 bg-muted px-3 py-2 font-semibold">Funcionário</th>
              {eventos.map((e) => (
                <th key={e.id} className="px-1 py-2 text-right font-semibold" title={e.naPlanilha ? `Código ${e.codigo} na Domínio` : "Fora da planilha da contabilidade (sem código da Domínio)"}>
                  <div className="w-[5.5rem] whitespace-normal leading-tight">{e.nome}</div>
                  <div className={cn("w-[5.5rem] text-[10px] font-normal", e.naPlanilha ? "text-muted-foreground" : "text-amber-700")}>
                    {e.naPlanilha ? `${e.codigo} · ${e.unidade === "horas" ? "horas" : "R$"}` : "sem código"}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 font-semibold">Observação do mês</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <React.Fragment key={g.filial.id}>
                <tr className="border-b bg-fct-navy/5">
                  <td colSpan={eventos.length + 2} className="px-3 py-1.5">
                    <div className="sticky left-3 flex w-max flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-fct-navy">
                        {g.filial.codigo} · {g.filial.nome}
                      </span>
                      <span className="text-muted-foreground">{g.filial.cnpj ?? "sem CNPJ"}</span>
                      <span className="text-muted-foreground">{g.funcionarios.length} funcionário(s)</span>
                      {g.filial.codigoDominio ? (
                        <>
                          <span className="text-muted-foreground">Domínio {g.filial.codigoDominio}</span>
                          <a
                            href={`/api/folha-lancamentos/planilha?competencia=${competencia}&filial=${g.filial.id}`}
                            className="inline-flex items-center gap-1 font-medium text-fct-navy underline-offset-2 hover:underline"
                          >
                            <Download className="size-3.5" aria-hidden /> {g.filial.arquivo}
                          </a>
                        </>
                      ) : (
                        <a href="/rh/lancamentos/configuracao" className="text-amber-800 underline-offset-2 hover:underline">
                          sem código da Domínio: informe em Configurar para gerar a planilha
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {g.funcionarios.map((f) => (
                  <Linha key={f.id} f={f} eventos={eventos} linha={indice++} registrar={registrar} />
                ))}
              </React.Fragment>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={eventos.length + 2} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Nenhum funcionário com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {msg ? (
            <span className={cn("inline-flex items-center gap-1.5", msg.ok ? "text-emerald-700" : "text-red-700")}>
              {msg.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
              {msg.texto}
            </span>
          ) : qtd > 0 ? (
            <span className="text-amber-800">
              {qtd} alteração(ões) não salva(s){invalidas > 0 ? ` · ${invalidas} com valor inválido` : ""}
            </span>
          ) : (
            "Digite horas ou valores (ex.: 9,58). Enter desce para a linha de baixo. Célula vazia apaga o lançamento."
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={descartar} disabled={qtd === 0 || salvando}>
            <Undo2 data-icon="inline-start" />
            Descartar
          </Button>
          <Button size="sm" onClick={salvar} disabled={qtd === 0 || invalidas > 0 || salvando}>
            <Save data-icon="inline-start" />
            {salvando ? "Salvando…" : qtd > 0 ? `Salvar ${qtd}` : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
