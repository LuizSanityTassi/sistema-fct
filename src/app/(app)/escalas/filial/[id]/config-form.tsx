"use client";

import { useActionState } from "react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIAS, ROTULO_DIA } from "@/lib/escalas/motor";
import { DIAS_SEMANA_ORDEM } from "@/lib/escalas/resumo";
import { salvarFilialEscala } from "../../actions";

type Valores = {
  semana_abre: string;
  semana_fecha: string;
  sabado_abre: string;
  sabado_fecha: string;
  domingo_abre: string;
  domingo_fecha: string;
  min_farmaceuticos: number;
  acordo: boolean;
  folgas: number[];
};

function Faixa({ nome, rotulo, abre, fecha, dica, erro, podeEditar }: { nome: string; rotulo: string; abre: string; fecha: string; dica?: string; erro?: string; podeEditar: boolean }) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">{rotulo}</legend>
      <div className="flex items-center gap-2">
        <Input type="time" name={`${nome}_abre`} defaultValue={abre} aria-label={`${rotulo}: abre`} className="w-32" disabled={!podeEditar} aria-invalid={!!erro || undefined} />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="time" name={`${nome}_fecha`} defaultValue={fecha} aria-label={`${rotulo}: fecha`} className="w-32" disabled={!podeEditar} aria-invalid={!!erro || undefined} />
      </div>
      {erro ? <p className="text-xs font-medium text-destructive">{erro}</p> : dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </fieldset>
  );
}

/** Horário de funcionamento, mínimo de farmacêuticos, acordo de jornada e dias permitidos para folga. */
export function ConfigFilialForm({ branchId, valores, podeEditar }: { branchId: string; valores: Valores; podeEditar: boolean }) {
  const [estado, enviar, pendente] = useActionState(salvarFilialEscala, {});
  const e = estado.erros ?? {};
  return (
    <form action={enviar} className="space-y-4 px-5 pb-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <ErroFormulario mensagem={estado.erro} />
      {estado.ok && <AvisoSucesso mensagem={estado.ok} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Faixa nome="semana" rotulo="Segunda a sexta" abre={valores.semana_abre} fecha={valores.semana_fecha} erro={e.semana} podeEditar={podeEditar} />
        <Faixa nome="sabado" rotulo="Sábado" abre={valores.sabado_abre} fecha={valores.sabado_fecha} dica="Vazio = loja fechada no sábado." erro={e.sabado} podeEditar={podeEditar} />
        <Faixa nome="domingo" rotulo="Domingo" abre={valores.domingo_abre} fecha={valores.domingo_fecha} dica="Vazio = loja fechada no domingo." erro={e.domingo} podeEditar={podeEditar} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Farmacêuticos mínimos por hora</span>
          <Input type="number" name="min_farmaceuticos" min={0} max={9} defaultValue={valores.min_farmaceuticos} className="w-24" disabled={!podeEditar} aria-invalid={!!e.min_farmaceuticos || undefined} />
          {e.min_farmaceuticos && <span className="text-xs font-medium text-destructive">{e.min_farmaceuticos}</span>}
        </label>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">Dias permitidos para folga</legend>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA_ORDEM.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10">
                <input type="checkbox" name="folgas" value={d} defaultChecked={valores.folgas.includes(d)} disabled={!podeEditar} className="accent-primary" />
                {ROTULO_DIA[DIAS[d]]}
              </label>
            ))}
          </div>
          {e.folgas ? (
            <p className="text-xs font-medium text-destructive">{e.folgas}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Loja aberta todos os dias precisa de pelo menos dois dias abertos marcados (duas folgas por semana). Terça, quarta e quinta têm preferência.</p>
          )}
        </fieldset>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="acordo" defaultChecked={valores.acordo} disabled={!podeEditar} className="size-4 accent-primary" />
        Acordo ou convenção coletiva permite jornada diária acima de 8 horas
      </label>
      {podeEditar && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar funcionamento"}
          </Button>
        </div>
      )}
    </form>
  );
}
