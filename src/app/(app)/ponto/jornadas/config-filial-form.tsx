"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  filial: { id: string; codigo: string; nome: string };
  jornadas: { id: string; nome: string }[];
  atual: { jornada_padrao_id: string | null; exige_localizacao: boolean; inicio_controle: string } | null;
  hoje: string;
};

/** Uma linha da tabela "Jornada padrão por filial". */
export function ConfigFilialForm({ action, filial, jornadas, atual, hoje }: Props) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="grid items-center gap-2 border-b px-5 py-2.5 last:border-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,16rem)_10rem_auto_auto]">
      <input type="hidden" name="branch_id" value={filial.id} />
      <p className="text-sm">
        <span className="font-mono text-xs text-fct-tinta">{filial.codigo}</span> {filial.nome}
        {estado.erro && <span className="block text-xs text-destructive">{estado.erro}</span>}
        {estado.ok && <span className="block text-xs text-emerald-700">{estado.ok}</span>}
      </p>
      <SelectNativo name="jornada_padrao_id" defaultValue={atual?.jornada_padrao_id ?? ""} aria-label={`Jornada padrão de ${filial.codigo}`}>
        <option value="">Sem jornada padrão</option>
        {jornadas.map((j) => (
          <option key={j.id} value={j.id}>
            {j.nome}
          </option>
        ))}
      </SelectNativo>
      <Input type="date" name="inicio_controle" defaultValue={atual?.inicio_controle ?? hoje} aria-label="Controle a partir de" title="O ponto passa a contar a partir desta data" className="h-9" />
      <BotaoSalvar size="sm" variant="outline" rotuloPendente="…">
        Salvar
      </BotaoSalvar>
    </form>
  );
}
