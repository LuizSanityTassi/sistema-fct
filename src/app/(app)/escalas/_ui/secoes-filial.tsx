import { Clock, ShieldAlert, Users } from "lucide-react";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { equipeDetalhada, funcionariosRh, type FilialEscala } from "@/lib/data/escalas";
import { modeloFilial } from "@/lib/escalas/resumo";
import { vinculoRh } from "@/lib/escalas/vinculo";
import { formatarDataHora } from "@/lib/formatos";
import { trazerDoRh } from "../actions";
import { ConfigFilialForm } from "./config-form";
import { EquipeEscala } from "./equipe";

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * Funcionamento, equipe da escala e conferência com o RH de uma filial (a mesma coisa na tela da filial e aberta no
 * simulador). `folgasNoSimulador`: os dias de folga são marcados no "Gerar opções", não aqui.
 */
export async function SecoesFilial({ f, folgasNoSimulador = false }: { f: FilialEscala; folgasNoSimulador?: boolean }) {
  const [equipe, todosRh, rhDaFilial] = await Promise.all([equipeDetalhada(f.id), funcionariosRh(), funcionariosRh(f.id)]);
  const naEscala = new Set(equipe.map((c) => c.employee_id).filter(Boolean));
  const foraDaEscala = rhDaFilial.filter((e) => !naEscala.has(e.id));
  const divergentes = equipe.map((c) => ({ c, v: vinculoRh(c, f.id) })).filter(({ v }) => v.tom !== "sucesso");
  const l = f.linha;
  const ativos = f.equipe.filter((p) => p.situacao === "ativo");

  return (
    <>
      <Painel
        titulo={`Funcionamento · ${f.codigo} ${f.nome}`}
        icone={Clock}
        descricao={`${modeloFilial(f.config)} · origem: ${l.origem ?? "—"} · atualizado em ${formatarDataHora(l.atualizado_em)}`}
        className="mb-4"
      >
        <ConfigFilialForm
          key={f.id}
          branchId={f.id}
          podeEditar
          folgasNoSimulador={folgasNoSimulador}
          valores={{
            semana_abre: hm(l.semana_abre),
            semana_fecha: hm(l.semana_fecha),
            sabado_abre: hm(l.sabado_abre),
            sabado_fecha: hm(l.sabado_fecha),
            domingo_abre: hm(l.domingo_abre),
            domingo_fecha: hm(l.domingo_fecha),
            min_farmaceuticos: l.min_farmaceuticos,
            acordo: l.acordo_jornada_estendida,
            folgas: l.folgas_permitidas,
          }}
        />
      </Painel>

      <Painel
        titulo={`Equipe da escala · ${f.codigo}`}
        icone={Users}
        descricao={`${equipe.length} pessoas · ${ativos.length} ativas · ${ativos.filter((p) => p.funcao === "farmaceutico").length} farmacêutico(s) ativo(s). Os horários de origem vieram da planilha e ficam só como referência.`}
        className="mb-4"
      >
        <EquipeEscala branchId={f.id} equipe={equipe} funcionarios={todosRh} />
      </Painel>

      {(divergentes.length > 0 || foraDaEscala.length > 0) && (
        <Painel
          titulo="Conferência com o cadastro do RH"
          icone={ShieldAlert}
          descricao="A equipe segue o RH sozinha: quem é cadastrado nesta filial entra, quem é desligado sai e quem muda de filial vai junto. Aqui fica só o que o sistema não decide sozinho."
          className="mb-4"
        >
          <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
            {divergentes.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Na escala, com diferença no RH ({divergentes.length})</h3>
                <ul className="space-y-1 text-sm">
                  {divergentes.map(({ c, v }) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
                      <span>{c.nome}</span>
                      <Status tom={v.tom}>{v.texto}</Status>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">“RH: outra filial” costuma ser terceirizado (ADM, RFA, TRIO, CIRLEI) ou transferência ainda não atualizada.</p>
              </div>
            )}
            {foraDaEscala.length > 0 && (
              <form action={trazerDoRh}>
                <input type="hidden" name="branch_id" value={f.id} />
                <h3 className="mb-2 text-sm font-semibold">No RH desta filial, fora da escala ({foraDaEscala.length})</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Não entraram sozinhos porque já estão na escala de outra filial ou parecem já estar na equipe com o nome escrito diferente (sem ficha ligada). Se for a mesma pessoa, edite quem está na equipe e ligue à ficha do RH; só traga se for outra pessoa.
                </p>
                <ul className="space-y-1 text-sm">
                  {foraDaEscala.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 border-b pb-1 last:border-0">
                      <input type="checkbox" name="employee_id" value={e.id} className="size-4 accent-primary" aria-label={`Trazer ${e.nome}`} />
                      <span className="flex-1">{e.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.cargo ?? "sem cargo"}
                        {e.status !== "ativo" ? ` · ${e.status === "ferias" ? "férias" : e.status}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button type="submit" variant="outline" size="sm" className="mt-2">
                  Trazer marcados para a escala
                </Button>
              </form>
            )}
          </div>
        </Painel>
      )}
    </>
  );
}
