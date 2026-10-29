"use client";

import { useActionState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { CampoSenha } from "@/components/form/campo-senha";
import { Campo, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoAcessoRelogio } from "./actions";

type Props = {
  acao: (
    prev: EstadoAcessoRelogio,
    fd: FormData,
  ) => Promise<EstadoAcessoRelogio>;
  filiais: { id: string; codigo: string; nome: string; temAcesso: boolean }[];
};

/** Criar o login do relógio de uma filial (ou trocar a senha, se já existir). */
export function FormAcessoRelogio({ acao, filiais }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form
      action={enviar}
      className="grid gap-3 px-5 pb-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <Campo id="acesso-filial" label="Filial">
        <SelectNativo id="acesso-filial" name="filial" required defaultValue="">
          <option value="" disabled>
            Escolha…
          </option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codigo} — {f.nome}
              {f.temAcesso ? " (trocar senha)" : ""}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <Campo id="acesso-senha" label="Senha do relógio">
        <CampoSenha
          id="acesso-senha"
          name="senha"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>
      <Campo id="acesso-senha2" label="Repita a senha">
        <CampoSenha
          id="acesso-senha2"
          name="senha2"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar acesso"}
      </Button>
      {(estado.erro || estado.ok) && (
        <p
          role={estado.erro ? "alert" : "status"}
          className={`flex items-start gap-2 text-sm sm:col-span-4 ${estado.erro ? "text-red-700" : "text-emerald-700"}`}
        >
          {estado.erro ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {estado.erro ?? estado.ok}
        </p>
      )}
    </form>
  );
}
