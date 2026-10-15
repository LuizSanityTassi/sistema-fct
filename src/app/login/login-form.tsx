"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { AvisoAtencao, Campo, ErroFormulario } from "@/components/form/campo";
import { CampoSenha } from "@/components/form/campo-senha";
import { TelaAcesso } from "@/components/layout/tela-acesso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, type AuthState } from "./actions";

export function LoginForm({ aviso }: { aviso?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <TelaAcesso
      titulo="Entrar"
      descricao="Use o e-mail e a senha do seu acesso ao Sistema FCT."
      rodape={
        <Link href="/recuperar-senha" className="font-medium text-fct-navy underline-offset-4 hover:underline">
          Esqueci minha senha
        </Link>
      }
    >
      <form action={formAction} className="space-y-4">
        <AvisoAtencao mensagem={aviso} />
        <Campo id="email" label="E-mail">
          <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required className="h-10" />
        </Campo>
        <Campo id="senha" label="Senha">
          <CampoSenha id="senha" name="senha" autoComplete="current-password" required className="h-10" />
        </Campo>
        <ErroFormulario mensagem={state.erro} />
        <Button type="submit" disabled={pending} className="h-10 w-full bg-fct-yellow text-base font-semibold text-fct-navy hover:bg-fct-yellow/85">
          <LogIn data-icon="inline-start" />
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </TelaAcesso>
  );
}
