"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { abrirPrecificacao } from "../actions";

/** Cadastro de auditoria de precificação: escolhe a filial e "Continuar" abre a tela dos produtos. */
export function NovaPrecificacao({ lojas }: { lojas: { id: string; codigo: string; nome: string }[] }) {
  const [estado, enviar, pendente] = useActionState(abrirPrecificacao, {});
  return (
    <form action={enviar} className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Cadastro de auditoria de precificação</h2>
      <ErroFormulario mensagem={estado.erro} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Filial</span>
        <SelectNativo name="branch_id" defaultValue={lojas.length === 1 ? lojas[0].id : ""} required>
          {lojas.length !== 1 && <option value="">Selecione uma filial</option>}
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo} — {l.nome}
            </option>
          ))}
        </SelectNativo>
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Abrindo…" : "Continuar"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </form>
  );
}
