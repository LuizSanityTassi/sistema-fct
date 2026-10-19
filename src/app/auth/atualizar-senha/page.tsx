"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { CampoSenha } from "@/components/form/campo-senha";
import { TelaAcesso } from "@/components/layout/tela-acesso";
import { Button } from "@/components/ui/button";
import { updatePassword, type AuthState } from "../../login/actions";

export default function AtualizarSenhaPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <TelaAcesso titulo="Definir nova senha" descricao="Escolha uma senha com pelo menos 8 caracteres.">
      <form action={formAction} className="space-y-4">
        <Campo id="senha" label="Nova senha" dica="Mínimo de 8 caracteres.">
          <CampoSenha id="senha" name="senha" autoComplete="new-password" minLength={8} required className="h-10" />
        </Campo>
        <Campo id="senha2" label="Confirmar senha">
          <CampoSenha id="senha2" name="senha2" autoComplete="new-password" minLength={8} required className="h-10" />
        </Campo>
        <ErroFormulario mensagem={state.erro} />
        <Button type="submit" disabled={pending} className="h-10 w-full text-base">
          <KeyRound data-icon="inline-start" />
          {pending ? "Salvando…" : "Salvar senha"}
        </Button>
      </form>
    </TelaAcesso>
  );
}
