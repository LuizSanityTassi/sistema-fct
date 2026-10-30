"use client";

import { useActionState } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoEquipeTele } from "./actions";

/** Inclui um vendedor na equipe de televendas (o mesmo código atualiza nome/equipe). */
export function EquipeTeleForm({ action, equipes }: { action: (prev: EstadoEquipeTele, fd: FormData) => Promise<EstadoEquipeTele>; equipes: string[] }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Código no Trier</span>
          <Input name="vendedor_codigo" inputMode="numeric" required className="w-32" placeholder="56562" />
        </label>
        <label className="grid min-w-56 flex-1 gap-1 text-sm">
          <span className="font-medium">Nome</span>
          <Input name="nome" required placeholder="Nome do vendedor" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Equipe</span>
          <Input name="equipe" required list="equipes-tele" className="w-40" placeholder="Criciúma" />
          <datalist id="equipes-tele">
            {equipes.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Função</span>
          <Input name="funcao" className="w-56" placeholder="Vendedora de tele-vendas" />
        </label>
        <Button type="submit" disabled={pendente}>
          <UserPlus data-icon="inline-start" />
          {pendente ? "Salvando…" : "Incluir na equipe"}
        </Button>
      </div>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
    </form>
  );
}

/** Escolhe o responsável do televendas (quebras de caixa e sangrias da equipe). */
export function ResponsavelTeleForm({ action, atual, usuarios }: { action: (prev: EstadoEquipeTele, fd: FormData) => Promise<EstadoEquipeTele>; atual: string | null; usuarios: { id: string; nome: string }[] }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          <span className="font-medium">Responsável do televendas</span>
          <SelectNativo name="responsavel" defaultValue={atual ?? ""}>
            <option value="">Ninguém (fica com o gestor de cada loja)</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome || "(sem nome)"}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="mover" defaultChecked className="size-4 accent-fct-tinta" />
          levar as quebras em aberto da equipe
        </label>
        <Button type="submit" variant="outline" disabled={pendente}>
          <UserCheck data-icon="inline-start" />
          {pendente ? "Salvando…" : "Salvar responsável"}
        </Button>
      </div>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
    </form>
  );
}
