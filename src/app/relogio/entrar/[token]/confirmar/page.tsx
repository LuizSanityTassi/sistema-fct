import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Abrir o relógio neste navegador?" };
export const dynamic = "force-dynamic";

/**
 * O link do relógio foi aberto num navegador que já está logado com uma pessoa (ex.: o administrador testando). Abrir
 * troca o login dela pelo do relógio; por isso pergunta antes. No computador da loja (sem login) não aparece.
 */
export default async function ConfirmarRelogioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const quem = data.user?.email ?? "uma pessoa";
  const seguro = /^[A-Za-z0-9_-]{40,64}$/.test(token) ? token : "";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <p className="flex items-center gap-2 font-heading text-lg">
          <TriangleAlert className="size-5 text-amber-600" aria-hidden />
          Este navegador já está logado
        </p>
        <p className="text-sm text-muted-foreground">
          Está aberto o login de <strong className="text-foreground">{quem}</strong>. Abrir o relógio aqui troca esse login pelo do relógio da filial:
          este navegador passa a mostrar só o relógio, até um gestor clicar em “Sair” e digitar o e-mail e a senha dele.
        </p>
        <p className="text-sm text-muted-foreground">
          Para testar sem perder o seu login, abra o link numa janela anônima (Ctrl+Shift+N).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" nativeButton={false} render={<Link href="/portal" />}>
            Voltar para o sistema
          </Button>
          {seguro && (
            <Button nativeButton={false} render={<a href={`/relogio/entrar/${seguro}?confirmar=1`} />}>
              Abrir o relógio neste navegador
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
