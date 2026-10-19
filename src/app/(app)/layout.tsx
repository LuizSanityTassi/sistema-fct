import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { signOut } from "@/app/login/actions";
import { AppShell } from "@/components/layout/app-shell";
import { getSessao } from "@/lib/auth/session";
import { rotuloCargo } from "@/lib/roles";
import { COOKIE_MENU } from "@/lib/tema";

// Área autenticada: lê cookies de sessão a cada requisição, nada aqui é pré-renderizado.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [sessao, jar] = await Promise.all([getSessao(), cookies()]);

  return (
    <AppShell
      usuario={{ nome: sessao.nome, email: sessao.email, papel: sessao.papel, rotuloCargo: rotuloCargo(sessao.cargo, sessao.adminSistema) }}
      onSair={signOut}
      menuRecolhido={jar.get(COOKIE_MENU)?.value === "recolhido"}
    >
      {children}
    </AppShell>
  );
}
