import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/layout/app-shell";
import { getSessao } from "@/lib/auth/session";

// Área autenticada: lê cookies de sessão a cada requisição, nada aqui é pré-renderizado.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await getSessao();

  return (
    <AppShell
      usuario={{ nome: sessao.nome, email: sessao.email, papel: sessao.papel }}
      onSair={signOut}
    >
      {children}
    </AppShell>
  );
}
