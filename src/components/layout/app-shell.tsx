"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, LogOut, Menu } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { grupoDaRota, itemDaRota, navParaPapel } from "@/lib/nav";
import { PAPEL_LABEL, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export type UsuarioShell = {
  nome: string;
  email: string;
  papel: AppRole;
};

type AppShellProps = {
  usuario: UsuarioShell;
  /** Server Action de logout (passada pelo layout do servidor). */
  onSair: () => Promise<void>;
  children: React.ReactNode;
};

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? "?").slice(0, 2);
  return letras.toUpperCase();
}

function Marca({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3 px-4 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-fct-red text-[13px] font-black tracking-tight text-white shadow-sm">
        FCT
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
          Farmácias FCT
        </span>
        <span className="block truncate text-base font-semibold text-white">Sistema FCT</span>
      </span>
    </Link>
  );
}

function NavLinks({
  papel,
  pathname,
  onNavigate,
}: {
  papel: AppRole;
  pathname: string;
  onNavigate?: () => void;
}) {
  const grupos = navParaPapel(papel);
  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
      {grupos.map((grupo, idx) => (
        <div key={grupo.titulo ?? `grupo-${idx}`} className={idx > 0 ? "mt-5" : undefined}>
          {grupo.titulo && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
              {grupo.titulo}
            </p>
          )}
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icone = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      ativo
                        ? "bg-sidebar-accent text-white shadow-[inset_3px_0_0_0_var(--fct-yellow)]"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white",
                    )}
                  >
                    <Icone
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        ativo ? "text-fct-yellow" : "text-sidebar-foreground/55 group-hover:text-white",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function RodapeSidebar() {
  return (
    <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/45">
      Uso interno · Farmácias FCT
    </div>
  );
}

function MenuUsuario({ usuario, onSair }: Pick<AppShellProps, "usuario" | "onSair">) {
  const [saindo, iniciarSaida] = React.useTransition();
  const sair = () => {
    iniciarSaida(async () => {
      await onSair();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Menu do usuário" />}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-fct-navy text-[11px] font-semibold text-white">
            {iniciais(usuario.nome)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{usuario.nome}</span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{usuario.nome}</p>
          <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          <Badge variant="secondary" className="mt-2">
            {PAPEL_LABEL[usuario.papel]}
          </Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={sair} disabled={saindo}>
          <LogOut aria-hidden />
          {saindo ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ usuario, onSair, children }: AppShellProps) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = React.useState(false);
  const fecharMenu = React.useCallback(() => setMenuAberto(false), []);

  // Troca de rota fecha o menu mobile.
  React.useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  const item = itemDaRota(pathname);
  const grupo = grupoDaRota(pathname);

  return (
    <div className="flex min-h-screen w-full">
      {/* Menu lateral fixo (desktop) */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar lg:text-sidebar-foreground">
        <Marca />
        <NavLinks papel={usuario.papel} pathname={pathname} />
        <RodapeSidebar />
      </aside>

      {/* Menu lateral em gaveta (mobile/tablet) */}
      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-72"
        >
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <Marca onNavigate={fecharMenu} />
          <NavLinks papel={usuario.papel} pathname={pathname} onNavigate={fecharMenu} />
          <RodapeSidebar />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="h-0.5 bg-fct-red" aria-hidden />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
          >
            <Menu />
          </Button>
          <div className="min-w-0 flex-1">
            <nav aria-label="Localização" className="flex items-center gap-1.5 text-sm">
              {grupo?.titulo && (
                <>
                  <span className="hidden text-muted-foreground sm:inline">{grupo.titulo}</span>
                  <ChevronRight className="hidden size-3.5 text-muted-foreground sm:inline" aria-hidden />
                </>
              )}
              <span className="truncate font-medium">{item?.label ?? "Sistema FCT"}</span>
            </nav>
          </div>
          <MenuUsuario usuario={usuario} onSair={onSair} />
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
