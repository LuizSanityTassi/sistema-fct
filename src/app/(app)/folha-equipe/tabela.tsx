import { Fragment } from "react";
import { formatarValorGrade } from "@/lib/rh/lancamentos";

export type EventoEquipe = { id: string; nome: string; unidade: string };
export type FuncionarioEquipe = { id: string; nome: string; matricula: string | null; funcao: string; noMes: boolean; valores: Record<string, number> };
export type GrupoEquipe = { filial: { id: string; codigo: string; nome: string }; funcionarios: FuncionarioEquipe[] };

/** Os lançamentos do mês só para ver, sem nenhum campo: quem lança é o RH. */
export function TabelaEquipe({ eventos, grupos }: { eventos: EventoEquipe[]; grupos: GrupoEquipe[] }) {
  const total = grupos.reduce((s, g) => s + g.funcionarios.length, 0);
  return (
    <div className="rounded-xl border bg-card">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="border-b text-left text-xs">
              <th scope="col" className="sticky left-0 z-30 bg-muted px-3 py-2 font-semibold">
                Colaborador
              </th>
              {eventos.map((e) => (
                <th key={e.id} scope="col" className="px-2 py-2 text-right font-semibold">
                  <div className="w-[5.5rem] leading-tight whitespace-normal">{e.nome}</div>
                  <div className="w-[5.5rem] text-[10px] font-normal text-muted-foreground">{e.unidade === "horas" ? "horas" : "R$"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.filial.id}>
                <tr className="border-b bg-fct-tinta/5">
                  <td colSpan={eventos.length + 1} className="px-3 py-1.5">
                    <div className="sticky left-3 flex w-max flex-wrap items-center gap-x-3 text-xs">
                      <span className="font-semibold text-fct-tinta">
                        {g.filial.codigo} · {g.filial.nome}
                      </span>
                      <span className="text-muted-foreground">{g.funcionarios.length === 1 ? "1 colaborador" : `${g.funcionarios.length} colaboradores`}</span>
                    </div>
                  </td>
                </tr>
                {g.funcionarios.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="sticky left-0 z-10 max-w-72 min-w-64 bg-card px-3 py-1.5">
                      <div className="truncate text-sm font-medium" title={f.nome}>
                        {f.nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.matricula ? `Matr. ${f.matricula}` : "sem matrícula"} · {f.funcao || "—"}
                        {!f.noMes && <span className="ml-1 text-amber-700">· fora do mês</span>}
                      </div>
                    </td>
                    {eventos.map((e) => {
                      const valor = f.valores[e.id];
                      return (
                        <td key={e.id} className="px-2 py-1.5 text-right tabular-nums">
                          {valor ? formatarValorGrade(valor) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
            {total === 0 && (
              <tr>
                <td colSpan={eventos.length + 1} className="vazio">
                  Nenhum colaborador com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">Só consulta: quem lança estes valores é o RH. Se algo estiver errado, fale com o RH.</p>
    </div>
  );
}
