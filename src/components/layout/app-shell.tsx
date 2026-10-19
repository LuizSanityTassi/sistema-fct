"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, ChevronsUpDown, LogOut, Menu, Monitor, Moon, PanelLeft, Smartphone, Sun } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dica, DicaProvider } from "@/components/ui/tooltip";
import { BuscaRapida } from "@/components/layout/busca-rapida";
import { Emblema } from "@/components/layout/marca";
import { SinoPendencias } from "@/components/layout/sino-pendencias";
import { useTema } from "@/components/layout/tema";
import { AvisoInstalarApp, useInstalarPeloMenu } from "@/components/layout/aviso-instalar";
import { grupoDaRota, itemDaRota, navParaPapel } from "@/lib/nav";
import { PAPEL_LABEL, type AppRole } from "@/lib/roles";
import { COOKIE_MENU, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

export type UsuarioShell = {
  nome: string;
  email: string;
  /** papel que vale para o menu (permissões) */
  papel: AppRole;
  /** como o cargo aparece (ex.: "TI · administrador do sistema"); sem ele, o nome do papel */
  rotuloCargo?: string;
};

type AppShellProps = {
  usuario: UsuarioShell;
  /** Server Action de logout (passada pelo layout do servidor). */
  onSair: () => Promise<void>;
  /** Menu lateral recolhido (só ícones), lido do cookie para não piscar. */
  menuRecolhido?: boolean;
  children: React.ReactNode;
};

const CHAVE_GRUPOS = "fct.menu.grupos";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? "?").slice(0, 2);
  return letras.toUpperCase();
}

function Marca({ recolhido, onNavigate }: { recolhido?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      aria-label="Sistema FCT, ir para o início"
      className={cn("flex h-14 shrink-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset", recolhido ? "justify-center px-0" : "px-4")}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs ring-1 ring-black/5">
        <Emblema largura={28} prioridade />
      </span>
      {!recolhido && (
        <span className="min-w-0 leading-none">
          <span className="block truncate font-heading text-[15px] text-foreground">Sistema FCT</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">Farmácias FCT</span>
        </span>
      )}
    </Link>
  );
}

/** Grupos abertos/fechados guardados no navegador (o grupo da tela atual fica sempre aberto). */
function useGruposAbertos() {
  const [salvos, setSalvos] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(CHAVE_GRUPOS);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a preferência do navegador só existe depois de montar
      if (v) setSalvos(JSON.parse(v));
    } catch {
      /* navegador sem armazenamento: segue o padrão */
    }
  }, []);
  const alternar = React.useCallback((grupo: string, aberto: boolean) => {
    setSalvos((s) => {
      const novo = { ...s, [grupo]: aberto };
      try {
        window.localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  }, []);
  return { salvos, alternar };
}

function NavLinks({ papel, pathname, recolhido, onNavigate }: { papel: AppRole; pathname: string; recolhido?: boolean; onNavigate?: () => void }) {
  const grupos = navParaPapel(papel);
  const { salvos, alternar } = useGruposAbertos();
  const idBase = React.useId();
  // a tela ativa é a de endereço mais longo que casa (Financeiro × Financeiro › Diferença de caixa)
  const ativoHref = grupos
    .flatMap((g) => g.itens.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label="Menu principal" className={cn("flex-1 overflow-y-auto pb-4", recolhido ? "px-2 [scrollbar-width:none]" : "px-3")}>
      {grupos.map((grupo, idx) => {
        const temAtivo = grupo.itens.some((i) => i.href === ativoHref);
        const aberto = recolhido || !grupo.titulo || temAtivo || (salvos[grupo.titulo] ?? true);
        const idLista = `${idBase}-${idx}`;
        return (
          <div key={grupo.titulo ?? `grupo-${idx}`} className={idx > 0 ? (recolhido ? "mt-2 border-t border-sidebar-border pt-2" : "mt-5") : undefined}>
            {grupo.titulo && !recolhido && (
              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={idLista}
                disabled={temAtivo}
                onClick={() => alternar(grupo.titulo!, !aberto)}
                className="group/titulo mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-1 sobrescrito outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:cursor-default disabled:hover:text-muted-foreground"
                title={temAtivo ? "A tela atual está neste grupo" : aberto ? "Recolher grupo" : "Mostrar grupo"}
              >
                {grupo.titulo}
                <ChevronDown
                  className={cn("size-3.5 opacity-0 transition-[transform,opacity] group-hover/titulo:opacity-100 group-focus-visible/titulo:opacity-100", !aberto && "-rotate-90 opacity-100", temAtivo && "invisible")}
                  aria-hidden
                />
              </button>
            )}
            <ul id={idLista} hidden={!aberto} className="space-y-px">
              {grupo.itens.map((item) => {
                const ativo = item.href === ativoHref;
                const Icone = item.icon;
                return (
                  <li key={item.href} className="relative">
                    {ativo && <span aria-hidden className={cn("absolute top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-fct-red", recolhido ? "-left-2" : "-left-3")} />}
                    <Dica texto={item.label} lado="right" desligada={!recolhido}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={ativo ? "page" : undefined}
                        aria-label={recolhido ? item.label : undefined}
                        className={cn(
                          "group flex h-8 items-center gap-2.5 rounded-md text-[13.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                          recolhido ? "w-full justify-center" : "px-2.5",
                          ativo ? "bg-card text-foreground shadow-xs ring-1 ring-sidebar-border" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        <Icone aria-hidden className={cn("size-4 shrink-0 transition-colors", ativo ? "text-fct-red" : "text-muted-foreground group-hover:text-foreground")} />
                        {!recolhido && <span className="truncate">{item.label}</span>}
                      </Link>
                    </Dica>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

const TEMAS: { valor: Tema; rotulo: string; icone: typeof Sun }[] = [
  { valor: "claro", rotulo: "Claro", icone: Sun },
  { valor: "escuro", rotulo: "Escuro", icone: Moon },
  { valor: "sistema", rotulo: "Igual ao sistema", icone: Monitor },
];

/** Rodapé do menu: quem está logado, perfil, tema e sair. */
function MenuUsuario({ usuario, onSair, recolhido }: Pick<AppShellProps, "usuario" | "onSair"> & { recolhido?: boolean }) {
  const [saindo, iniciarSaida] = React.useTransition();
  const { tema, escolher } = useTema();
  const app = useInstalarPeloMenu();
  const sair = () => {
    iniciarSaida(async () => {
      await onSair();
    });
  };

  return (
    <div className={cn("shrink-0 border-t border-sidebar-border", recolhido ? "p-2" : "p-3")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[popup-open]:bg-sidebar-accent",
            recolhido ? "justify-center p-1" : "p-1.5",
          )}
          aria-label={`Menu do usuário: ${usuario.nome}`}
        >
          <Avatar className="size-8" aria-hidden>
            <AvatarFallback className="bg-fct-red-fundo text-[11px] font-semibold text-white">{iniciais(usuario.nome)}</AvatarFallback>
          </Avatar>
          {!recolhido && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium text-foreground">{usuario.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{usuario.rotuloCargo ?? PAPEL_LABEL[usuario.papel]}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side={recolhido ? "right" : "top"} align={recolhido ? "end" : "start"} sideOffset={8} className="w-64">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <Avatar className="size-9" aria-hidden>
              <AvatarFallback className="bg-fct-red-fundo text-xs font-semibold text-white">{iniciais(usuario.nome)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{usuario.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={tema} onValueChange={(v) => escolher(v as Tema)}>
              {TEMAS.map((t) => {
                const Icone = t.icone;
                return (
                  <DropdownMenuRadioItem key={t.valor} value={t.valor} closeOnClick={false}>
                    <Icone className="text-muted-foreground" aria-hidden />
                    {t.rotulo}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {app.disponivel && (
            <DropdownMenuItem onClick={app.acionar}>
              <Smartphone aria-hidden />
              {app.rotulo}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={sair} disabled={saindo}>
            <LogOut aria-hidden />
            {saindo ? "Saindo…" : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {app.dialogo}
    </div>
  );
}

export function AppShell({ usuario, onSair, menuRecolhido = false, children }: AppShellProps) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = React.useState(false);
  const [recolhido, setRecolhido] = React.useState(menuRecolhido);
  const fecharMenu = React.useCallback(() => setMenuAberto(false), []);

  const alternarMenu = React.useCallback(() => {
    setRecolhido((r) => {
      const novo = !r;
      document.cookie = `${COOKIE_MENU}=${novo ? "recolhido" : "aberto"}; path=/; max-age=31536000; samesite=lax`;
      return novo;
    });
  }, []);

  // Troca de rota fecha o menu mobile.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fechar a gaveta quando a rota muda
    setMenuAberto(false);
  }, [pathname]);

  // "[" recolhe/abre o menu lateral (fora de campos de texto)
  React.useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      e.preventDefault();
      alternarMenu();
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, [alternarMenu]);

  const item = itemDaRota(pathname);
  const grupo = grupoDaRota(pathname);
  const naInicial = item?.href === "/dashboard";

  return (
    <DicaProvider>
      <div className="flex min-h-screen w-full">
        <a
          href="#conteudo"
          className="sr-only z-[60] rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>

        {/* Menu lateral fixo (desktop) */}
        <aside
          data-recolhido={recolhido || undefined}
          className={cn(
            "hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:flex-col",
            recolhido ? "lg:w-[3.75rem]" : "lg:w-60",
          )}
        >
          <Marca recolhido={recolhido} />
          <NavLinks papel={usuario.papel} pathname={pathname} recolhido={recolhido} />
          <MenuUsuario usuario={usuario} onSair={onSair} recolhido={recolhido} />
        </aside>

        {/* Menu lateral em gaveta (mobile/tablet) */}
        <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
          <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-72">
            <SheetTitle className="sr-only">Menu principal</SheetTitle>
            <Marca onNavigate={fecharMenu} />
            <NavLinks papel={usuario.papel} pathname={pathname} onNavigate={fecharMenu} />
            <MenuUsuario usuario={usuario} onSair={onSair} />
          </SheetContent>
        </Sheet>

        <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out", recolhido ? "lg:pl-[3.75rem]" : "lg:pl-60")}>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-5 lg:px-6">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menu" aria-expanded={menuAberto} onClick={() => setMenuAberto(true)}>
              <Menu />
            </Button>
            <Link href="/dashboard" aria-label="Início" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs ring-1 ring-black/5 lg:hidden">
              <Emblema largura={26} />
            </Link>
            <Dica texto={recolhido ? "Abrir menu" : "Recolher menu"} atalho="[" lado="bottom">
              <Button variant="ghost" size="icon-sm" className="-ml-1 hidden text-muted-foreground lg:inline-flex" aria-label={recolhido ? "Abrir menu lateral" : "Recolher menu lateral"} aria-pressed={recolhido} onClick={alternarMenu}>
                <PanelLeft />
              </Button>
            </Dica>
            <span className="mx-1 hidden h-4 w-px bg-border lg:block" aria-hidden />

            <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              {!naInicial && (
                <>
                  <Link href="/dashboard" className="hidden rounded px-1 text-muted-foreground transition-colors hover:text-foreground sm:inline">
                    Início
                  </Link>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden />
                </>
              )}
              {grupo?.titulo && (
                <>
                  <span className="hidden px-1 text-muted-foreground md:inline">{grupo.titulo}</span>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 md:inline" aria-hidden />
                </>
              )}
              <span className="truncate px-1 font-medium" aria-current="page">
                {item?.label ?? "Sistema FCT"}
              </span>
            </nav>

            <BuscaRapida papel={usuario.papel} />
            <SinoPendencias />
          </header>

          <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
            <div className="mx-auto w-full max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <AvisoInstalarApp />
              {children}
            </div>
          </main>
        </div>
      </div>
    </DicaProvider>
  );
}
