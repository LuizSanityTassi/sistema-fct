"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { TelaAcesso } from "@/components/layout/tela-acesso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestReset, type AuthState } from "../login/actions";

export default function RecuperarSenhaPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(requestReset, {});
  return (
    <TelaAcesso
      titulo="Recuperar senha"
      descricao="Informe seu e-mail e enviaremos um link para definir uma nova senha."
      rodape={
        <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-fct-tinta underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Voltar ao login
        </Link>
      }
    >
      <form action={formAction} className="space-y-4">
        <Campo id="email" label="E-mail">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="h-10" />
        </Campo>
        <ErroFormulario mensagem={state.erro} />
        <AvisoSucesso mensagem={state.ok} />
        <Button type="submit" disabled={pending} className="h-10 w-full text-base">
          <Send data-icon="inline-start" />
          {pending ? "Enviando…" : "Enviar link"}
        </Button>
      </form>
    </TelaAcesso>
  );
}
