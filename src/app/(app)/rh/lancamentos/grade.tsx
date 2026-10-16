"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, Download, LoaderCircle, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAVE_QUEBRA_CAIXA, formatarValorGrade, lerValorDigitado } from "@/lib/rh/lancamentos";
import { cn } from "@/lib/utils";
import { salvarLancamentos, type AlteracaoObs, type AlteracaoValor } from "./actions";

export type EventoGrade = { id: string; chave: string; nome: string; codigo: number | null; unidade: "horas" | "valor"; naPlanilha: boolean };
export type FuncionarioGrade = {
  id: string;
  nome: string;
  matricula: string | null;
  funcao: string;
  ativoNoMes: boolean;
  farmaceutico: boolean;
  valores: Record<string, number>;
  obs: { texto: string; pendente: boolean } | null;
};
export type GrupoGrade = {
  filial: { id: string; codigo: string; nome: string; cnpj: string | null; codigoDominio: number | null; codigoProvisorio: boolean; arquivo: string };
  funcionarios: FuncionarioGrade[];
};

type Props = { competencia: string; eventos: EventoGrade[]; grupos: GrupoGrade[]; versao: string };

type Registrar = (chave: string, valor: string | null) => void;
/** A célula se inscreve na grade: "salvo" (passa a comparar com o valor gravado) e "reverter" (descartar). */
/** `salvo(valor, igual)`: o banco agora tem `valor`; `igual` = a célula não foi mexida de novo enquanto gravava. */
type OuvinteCelula = { salvo: (valor: string, igual: boolean) => void; reverter: () => void };
type Inscrever = (chave: string, fns: OuvinteCelula) => () => void;

// a grade montada guarda aqui o "salvar o que falta", para os botões de baixar planilha fora dela
let salvarPendentesDaGrade: (() => Promise<boolean>) | null = null;

/** Link de download que antes grava o que foi digitado e ainda não salvou (senão a planilha sai sem esses valores). */
export function LinkBaixarPlanilha({ href, onClick, ...resto }: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a
      {...resto}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !salvarPendentesDaGrade) return;
        e.preventDefault();
        salvarPendentesDaGrade().then((ok) => {
          if (ok) window.location.href = href;
        });
      }}
    />
  );
}

/** Célula de valor: guarda o texto digitado e avisa a grade quando difere do gravado. */
const Celula = React.memo(function Celula({ chave, inicial, linha, coluna, registrar, inscrever, rotulo }: { chave: string; inicial: number | undefined; linha: number; coluna: number; registrar: Registrar; inscrever: Inscrever; rotulo: string }) {
  const original = inicial ? formatarValorGrade(inicial) : "";
  const [estado, setEstado] = React.useState<"igual" | "alterado" | "invalido">("igual");
  // valor gravado no banco: começa com o que veio do servidor e muda quando o salvamento automático grava
  const base = React.useRef(inicial ?? 0);
  const entrada = React.useRef<HTMLInputElement>(null);
  React.useEffect(
    () =>
      inscrever(chave, {
        salvo: (v, igual) => {
          base.current = v === "" ? 0 : Number(v);
          if (igual) setEstado("igual");
        },
        reverter: () => {
          if (entrada.current) entrada.current.value = base.current ? formatarValorGrade(base.current) : "";
          setEstado("igual");
        },
      }),
    [chave, inscrever],
  );
  return (
    <input
      ref={entrada}
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
        const mudou = (n ?? 0) !== base.current;
        setEstado(mudou ? "alterado" : "igual");
        registrar(chave, mudou ? (n === null ? "" : String(n)) : null);
      }}
      className={cn(
        "h-8 w-[5.5rem] rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums outline-none hover:border-border focus:border-fct-tinta focus:bg-background",
        estado === "alterado" && "border-amber-300 bg-amber-50",
        estado === "invalido" && "border-red-500 bg-red-50",
      )}
    />
  );
});

const CelulaObs = React.memo(function CelulaObs({ funcionario, registrar, inscrever, linha, coluna }: { funcionario: FuncionarioGrade; registrar: Registrar; inscrever: Inscrever; linha: number; coluna: number }) {
  const [texto, setTexto] = React.useState(funcionario.obs?.texto ?? "");
  const [pendente, setPendente] = React.useState(funcionario.obs?.pendente ?? false);
  const base = React.useRef(funcionario.obs);
  const chave = `obs|${funcionario.id}`;
  React.useEffect(
    () =>
      inscrever(chave, {
        salvo: (v) => {
          const o = JSON.parse(v) as { texto: string; pendente: boolean };
          base.current = o.texto.trim() ? { texto: o.texto.trim(), pendente: o.pendente } : null;
        },
        reverter: () => {
          setTexto(base.current?.texto ?? "");
          setPendente(base.current?.pendente ?? false);
        },
      }),
    [chave, inscrever],
  );
  const atualizar = (t: string, p: boolean) => {
    const atual = base.current;
    const mudou = t.trim() !== (atual?.texto ?? "") || (t.trim() !== "" && p !== (atual?.pendente ?? false));
    registrar(chave, mudou ? JSON.stringify({ texto: t, pendente: p }) : null);
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
          const p = !base.current && t.trim() && !texto.trim() ? true : pendente;
          setTexto(t);
          setPendente(p);
          atualizar(t, p);
        }}
        className={cn(
          "h-8 w-64 rounded-md border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-border focus:border-fct-tinta focus:bg-background",
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

const Linha = React.memo(function Linha({ f, eventos, linha, registrar, inscrever }: { f: FuncionarioGrade; eventos: EventoGrade[]; linha: number; registrar: Registrar; inscrever: Inscrever }) {
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
          {e.chave === CHAVE_QUEBRA_CAIXA && f.farmaceutico ? (
            <span className="block w-[5.5rem] px-1.5 text-right text-xs text-muted-foreground" title="Farmacêutico não tem quebra de caixa">
              n/a
            </span>
          ) : (
            <Celula chave={`${f.id}|${e.id}`} inicial={f.valores[e.id]} linha={linha} coluna={c} registrar={registrar} inscrever={inscrever} rotulo={`${e.nome} de ${f.nome}`} />
          )}
        </td>
      ))}
      <td className="px-2 py-1">
        <CelulaObs funcionario={f} registrar={registrar} inscrever={inscrever} linha={linha} coluna={eventos.length} />
      </td>
    </tr>
  );
});

const ESPERA_SALVAR_MS = 1500;

export function GradeLancamentos({ competencia, eventos, grupos, versao }: Props) {
  const alteracoes = React.useRef(new Map<string, string>());
  const ouvintes = React.useRef(new Map<string, OuvinteCelula>());
  const [qtd, setQtd] = React.useState(0);
  const [invalidas, setInvalidas] = React.useState(0);
  const [chaveTabela, setChaveTabela] = React.useState(0);
  const [msg, setMsg] = React.useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = React.useRef<Promise<boolean> | null>(null);

  // dados novos do servidor: depois de cada gravação o servidor devolve a página atualizada. As células já sabem o
  // valor gravado, então só remonta (para pegar mudanças de outra pessoa) se ninguém estiver mexendo na grade:
  // remontar com o cursor numa célula apagaria o que está sendo digitado.
  const caixaGrade = React.useRef<HTMLDivElement>(null);
  const versaoAnterior = React.useRef(versao);
  React.useEffect(() => {
    if (versaoAnterior.current === versao) return;
    versaoAnterior.current = versao;
    const mexendo = alteracoes.current.size > 0 || emVoo.current !== null || caixaGrade.current?.contains(document.activeElement);
    if (mexendo) return;
    setChaveTabela((k) => k + 1);
  }, [versao]);

  React.useEffect(() => {
    if (qtd === 0) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [qtd]);

  const contar = () => {
    setQtd(alteracoes.current.size);
    setInvalidas([...alteracoes.current.values()].filter((v) => v === "#invalido").length);
  };

  /** Grava o que mudou. Só tira da lista o que não foi mexido de novo enquanto salvava. */
  const salvarAgora = React.useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (emVoo.current) await emVoo.current;
    // grava em lotes até não sobrar nada (se mexerem em algo enquanto grava, vai no lote seguinte)
    for (;;) {
      const lote = new Map(alteracoes.current);
      if (lote.size === 0) return true;
      if ([...lote.values()].includes("#invalido")) {
        setMsg({ ok: false, texto: "Há valor inválido na grade (em vermelho): corrija para salvar." });
        return false;
      }
      const valores: AlteracaoValor[] = [];
      const observacoes: AlteracaoObs[] = [];
      for (const [chave, v] of lote) {
        if (chave.startsWith("obs|")) {
          const o = JSON.parse(v) as { texto: string; pendente: boolean };
          observacoes.push({ employeeId: chave.slice(4), texto: o.texto, pendente: o.pendente });
        } else {
          const [employeeId, eventoId] = chave.split("|");
          valores.push({ employeeId, eventoId, valor: v === "" ? null : Number(v) });
        }
      }
      setSalvando(true);
      const tarefa = (async () => {
        try {
          const r = await salvarLancamentos(competencia, valores, observacoes);
          if (!r.ok) {
            setMsg({ ok: false, texto: `Não salvou: ${r.erro}` });
            return false;
          }
          for (const [chave, v] of lote) {
            const igual = alteracoes.current.get(chave) === v;
            if (igual) alteracoes.current.delete(chave);
            ouvintes.current.get(chave)?.salvo(v, igual);
          }
          contar();
          const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          setMsg({ ok: true, texto: `Tudo salvo às ${hora} (${r.gravados} valor(es) gravado(s), ${r.apagados} apagado(s)${r.observacoes ? `, ${r.observacoes} observação(ões)` : ""}).` });
          return true;
        } catch {
          setMsg({ ok: false, texto: "Não salvou: sem conexão com o servidor. Tente de novo." });
          return false;
        } finally {
          setSalvando(false);
        }
      })();
      emVoo.current = tarefa;
      const ok = await tarefa;
      emVoo.current = null;
      if (!ok) return false;
    }
  }, [competencia]);

  React.useEffect(() => {
    salvarPendentesDaGrade = salvarAgora;
    return () => {
      if (salvarPendentesDaGrade === salvarAgora) salvarPendentesDaGrade = null;
    };
  }, [salvarAgora]);

  const registrar = React.useCallback<Registrar>(
    (chave, valor) => {
      if (valor === null) alteracoes.current.delete(chave);
      else alteracoes.current.set(chave, valor);
      contar();
      setMsg(null);
      // salva sozinho quando a pessoa para de digitar
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (alteracoes.current.size && ![...alteracoes.current.values()].includes("#invalido")) void salvarAgora();
      }, ESPERA_SALVAR_MS);
    },
    [salvarAgora],
  );

  const inscrever = React.useCallback<Inscrever>((chave, fns) => {
    ouvintes.current.set(chave, fns);
    return () => {
      if (ouvintes.current.get(chave) === fns) ouvintes.current.delete(chave);
    };
  }, []);

  /** Volta as células alteradas para o último valor salvo. */
  const descartar = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    for (const chave of alteracoes.current.keys()) ouvintes.current.get(chave)?.reverter();
    alteracoes.current.clear();
    contar();
    setMsg(null);
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
      <div ref={caixaGrade} className="max-h-[70vh] overflow-auto">
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
                <tr className="border-b bg-fct-tinta/5">
                  <td colSpan={eventos.length + 2} className="px-3 py-1.5">
                    <div className="sticky left-3 flex w-max flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-fct-tinta">
                        {g.filial.codigo} · {g.filial.nome}
                      </span>
                      <span className="text-muted-foreground">{g.filial.cnpj ?? "sem CNPJ"}</span>
                      <span className="text-muted-foreground">{g.funcionarios.length} funcionário(s)</span>
                      {g.filial.codigoDominio ? (
                        <>
                          {g.filial.codigoProvisorio ? (
                            <a href="/rh/lancamentos/configuracao" className="text-amber-800 underline-offset-2 hover:underline" title="Número da filial no CNPJ. Troque pelo código da Domínio quando a contabilidade confirmar.">
                              código provisório {g.filial.codigoDominio}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Domínio {g.filial.codigoDominio}</span>
                          )}
                          <LinkBaixarPlanilha
                            href={`/api/folha-lancamentos/planilha?competencia=${competencia}&filial=${g.filial.id}`}
                            className="inline-flex items-center gap-1 font-medium text-fct-tinta underline-offset-2 hover:underline"
                          >
                            <Download className="size-3.5" aria-hidden /> {g.filial.arquivo}
                          </LinkBaixarPlanilha>
                        </>
                      ) : (
                        <a href="/rh/lancamentos/configuracao" className="text-amber-800 underline-offset-2 hover:underline">
                          sem CNPJ no cadastro: não gera planilha
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {g.funcionarios.map((f) => (
                  <Linha key={f.id} f={f} eventos={eventos} linha={indice++} registrar={registrar} inscrever={inscrever} />
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
          <span role="status" aria-live="polite">
            {salvando ? (
              <span className="inline-flex items-center gap-1.5 text-fct-tinta">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Salvando…
              </span>
            ) : msg && (!msg.ok || qtd === 0) ? (
              <span className={cn("inline-flex items-center gap-1.5", msg.ok ? "text-emerald-700" : "text-red-700")}>
                {msg.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
                {msg.texto}
              </span>
            ) : qtd > 0 ? (
              <span className="text-amber-800">
                {invalidas > 0 ? `${invalidas} valor(es) inválido(s) em vermelho: corrija para salvar` : `${qtd} alteração(ões): salva sozinho em instantes`}
              </span>
            ) : (
              "Digite horas ou valores (ex.: 9,58): salva sozinho quando você para de digitar. Enter desce para a linha de baixo. Célula vazia apaga o lançamento."
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={descartar} disabled={qtd === 0 || salvando}>
            <Undo2 data-icon="inline-start" />
            Desfazer
          </Button>
          <Button size="sm" onClick={() => void salvarAgora()} disabled={qtd === 0 || invalidas > 0 || salvando}>
            <Save data-icon="inline-start" />
            {salvando ? "Salvando…" : qtd > 0 ? `Salvar ${qtd}` : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
