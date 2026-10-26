"use client";

import { useActionState, useState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cargaSemanal, DIAS_SEMANA, duracao, minutosPrevistos, type DiaModelo } from "@/lib/ponto/calculo";
import type { EstadoPonto } from "@/lib/ponto/form";
import { cn } from "@/lib/utils";

type Inicial = {
  nome: string;
  descricao: string | null;
  tipo: "semanal" | "ciclo";
  branch_id: string | null;
  ciclo_dias: number | null;
  data_base: string | null;
  tolerancia_min: number;
  ativo: boolean;
  dias: DiaModelo[];
};

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  inicial?: Inicial | null;
  filiais: { id: string; codigo: string; nome: string }[];
};

const vazio = (posicao: number, folga = true): DiaModelo => ({ posicao, folga, entrada: null, intervalo_inicio: null, intervalo_fim: null, saida: null });
const dia = (posicao: number, entrada: string, ii: string | null, fi: string | null, saida: string): DiaModelo => ({ posicao, folga: false, entrada, intervalo_inicio: ii, intervalo_fim: fi, saida });

const MODELOS: { rotulo: string; tipo: "semanal" | "ciclo"; ciclo?: number; dias: DiaModelo[] }[] = [
  { rotulo: "Comercial 44h (seg–sex)", tipo: "semanal", dias: [vazio(0), ...[1, 2, 3, 4, 5].map((p) => dia(p, "08:00", "12:00", "13:00", "17:48")), vazio(6)] },
  { rotulo: "6x1 44h (seg–sáb)", tipo: "semanal", dias: [vazio(0), ...[1, 2, 3, 4, 5, 6].map((p) => dia(p, "08:00", "12:00", "13:00", "16:20"))] },
  { rotulo: "12x36", tipo: "ciclo", ciclo: 2, dias: [dia(0, "07:00", "12:00", "13:00", "19:00"), vazio(1)] },
];

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export function JornadaForm({ action, inicial, filiais }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const [tipo, setTipo] = useState<"semanal" | "ciclo">(inicial?.tipo ?? "semanal");
  const [ciclo, setCiclo] = useState<number>(inicial?.ciclo_dias ?? 2);
  const [dias, setDias] = useState<DiaModelo[]>(() => {
    const base = inicial?.dias ?? MODELOS[0].dias;
    return base.map((d) => ({ ...d, entrada: hhmm(d.entrada) || null, intervalo_inicio: hhmm(d.intervalo_inicio) || null, intervalo_fim: hhmm(d.intervalo_fim) || null, saida: hhmm(d.saida) || null }));
  });
  const erro = (c: string) => estado.erros?.[c];
  const qtd = tipo === "semanal" ? 7 : Math.max(1, Math.min(62, ciclo || 1));
  const linhas = Array.from({ length: qtd }, (_, i) => dias.find((d) => d.posicao === i) ?? vazio(i));
  const carga = cargaSemanal({ tipo, ciclo_dias: qtd, dias: linhas });

  function mudar(pos: number, campo: keyof DiaModelo, valor: string | boolean) {
    setDias((atual) => {
      const outros = atual.filter((d) => d.posicao !== pos);
      const d = atual.find((x) => x.posicao === pos) ?? vazio(pos);
      return [...outros, { ...d, [campo]: typeof valor === "string" ? valor || null : valor }].sort((a, b) => a.posicao - b.posicao);
    });
  }

  function aplicarModelo(m: (typeof MODELOS)[number]) {
    setTipo(m.tipo);
    if (m.ciclo) setCiclo(m.ciclo);
    setDias(m.dias);
  }

  function copiarPrimeiro() {
    const fonte = linhas.find((d) => !d.folga);
    if (!fonte) return;
    setDias(linhas.map((d) => (d.folga ? d : { ...fonte, posicao: d.posicao })));
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <ErroFormulario mensagem={estado.erro} />
      <section className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Campo id="j-nome" label="Nome" obrigatorio erro={erro("nome")} className="sm:col-span-2">
          <Input id="j-nome" name="nome" defaultValue={inicial?.nome ?? ""} maxLength={80} placeholder="Ex.: Comercial 44h, 12x36 noturno" aria-invalid={!!erro("nome")} />
        </Campo>
        <Campo id="j-filial" label="Vale para" dica="Vazio = todas as filiais">
          <SelectNativo id="j-filial" name="branch_id" defaultValue={inicial?.branch_id ?? ""}>
            <option value="">Todas as filiais</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="j-tol" label="Tolerância diária (min)" erro={erro("tolerancia_min")} dica="Diferença que não conta (CLT: até 10)">
          <Input id="j-tol" name="tolerancia_min" type="number" min={0} max={60} defaultValue={inicial?.tolerancia_min ?? 10} aria-invalid={!!erro("tolerancia_min")} />
        </Campo>
        <Campo id="j-desc" label="Descrição" erro={erro("descricao")} className="sm:col-span-2 lg:col-span-4">
          <Input id="j-desc" name="descricao" defaultValue={inicial?.descricao ?? ""} maxLength={300} placeholder="Opcional: para quem é, observações" />
        </Campo>
        <Campo id="j-tipo" label="Tipo">
          <SelectNativo id="j-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "semanal" | "ciclo")}>
            <option value="semanal">Semanal (por dia da semana)</option>
            <option value="ciclo">Escala em ciclo (12x36, 6x2…)</option>
          </SelectNativo>
        </Campo>
        {tipo === "ciclo" && (
          <>
            <Campo id="j-ciclo" label="Dias do ciclo" erro={erro("ciclo_dias")} dica="12x36 = 2 dias (trabalha, folga)">
              <Input id="j-ciclo" name="ciclo_dias" type="number" min={1} max={62} value={ciclo} onChange={(e) => setCiclo(Number(e.target.value))} aria-invalid={!!erro("ciclo_dias")} />
            </Campo>
            <Campo id="j-base" label="1º dia do ciclo" erro={erro("data_base")} dica="Data em que o dia 1 da escala acontece">
              <Input id="j-base" name="data_base" type="date" defaultValue={inicial?.data_base ?? ""} aria-invalid={!!erro("data_base")} />
            </Campo>
          </>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={inicial?.ativo ?? true} className="size-4 accent-fct-tinta" />
          Ativa (pode ser escolhida)
        </label>
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-semibold">Horários</h2>
            <p className="text-xs text-muted-foreground">
              Carga {tipo === "ciclo" ? "média " : ""}semanal: <strong className="text-foreground">{duracao(carga)}h</strong>. Saída menor que a entrada = vira a noite.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MODELOS.map((m) => (
              <Button key={m.rotulo} type="button" size="sm" variant="outline" onClick={() => aplicarModelo(m)}>
                {m.rotulo}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={copiarPrimeiro}>
              Repetir 1º dia útil
            </Button>
          </div>
        </header>
        {erro("dias") && <p className="px-5 pb-2 text-xs font-medium text-destructive">{erro("dias")}</p>}
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Dia</th>
                <th className="px-2 py-2 font-medium">Folga</th>
                <th className="px-2 py-2 font-medium">Entrada</th>
                <th className="px-2 py-2 font-medium">Saída p/ intervalo</th>
                <th className="px-2 py-2 font-medium">Volta</th>
                <th className="px-2 py-2 font-medium">Saída</th>
                <th className="px-4 py-2 text-right font-medium">Horas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((d) => {
                const e = erro(`d${d.posicao}`);
                return (
                  <tr key={d.posicao} className={cn("border-b last:border-0", d.folga && "bg-muted/40")}>
                    <td className="px-4 py-1.5 font-medium whitespace-nowrap">
                      {tipo === "semanal" ? DIAS_SEMANA[d.posicao] : `Dia ${d.posicao + 1}`}
                      {e && <p className="text-xs font-normal text-destructive">{e}</p>}
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" name={`d${d.posicao}_folga`} checked={d.folga} onChange={(ev) => mudar(d.posicao, "folga", ev.target.checked)} aria-label={`Folga ${d.posicao}`} className="size-4 accent-fct-tinta" />
                    </td>
                    {(["entrada", "intervalo_inicio", "intervalo_fim", "saida"] as const).map((c) => (
                      <td key={c} className="px-2 py-1.5">
                        <Input
                          type="time"
                          name={`d${d.posicao}_${c}`}
                          value={d.folga ? "" : (d[c] ?? "")}
                          disabled={d.folga}
                          onChange={(ev) => mudar(d.posicao, c, ev.target.value)}
                          aria-invalid={!!e}
                          className="h-8 w-28"
                        />
                      </td>
                    ))}
                    <td className="px-4 py-1.5 text-right tabular-nums">{d.folga ? "Folga" : duracao(minutosPrevistos(d))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Mudar um modelo muda o cálculo dos meses ainda abertos de quem usa esta jornada. Para mudar a partir de uma data, crie outro modelo e troque a jornada do funcionário em “Equipe e jornadas”.
      </p>
      <BotaoSalvar>Salvar jornada</BotaoSalvar>
    </form>
  );
}
