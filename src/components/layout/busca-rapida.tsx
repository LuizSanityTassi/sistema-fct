"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { navParaPapel } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Busca rápida de telas (Ctrl+K, ⌘K ou "/"): lista as telas que o papel do usuário pode abrir, filtra pelo nome,
 * grupo e descrição, e abre com Enter. Padrão combobox + listbox (setas, Enter, Esc) para teclado e leitor de tela.
 */
export function BuscaRapida({ papel, variante = "cabecalho" }: { papel: AppRole; variante?: "cabecalho" | "menu" }) {
  const router = useRouter();
  const [aberta, setAberta] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const idLista = React.useId();

  const itens = React.useMemo(
    () => navParaPapel(papel).flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo ?? "Início" }))),
    [papel],
  );
  const filtrados = React.useMemo(() => {
    const t = normalizar(termo.trim());
    if (!t) return itens;
    const palavras = t.split(/\s+/);
    return itens
      .filter((i) => {
        const alvo = normalizar(`${i.label} ${i.grupo} ${i.descricao}`);
        return palavras.every((p) => alvo.includes(p));
      })
      .sort((a, b) => Number(!normalizar(a.label).includes(palavras[0])) - Number(!normalizar(b.label).includes(palavras[0])));
  }, [termo, itens]);

  // variante "menu" só desenha o botão; o atalho de teclado fica numa instância só (a do cabeçalho)
  React.useEffect(() => {
    if (variante !== "cabecalho") return;
    const atalho = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setAberta((v) => !v);
      } else if (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setAberta(true);
      }
    };
    const abrirPorEvento = () => setAberta(true);
    window.addEventListener("keydown", atalho);
    window.addEventListener("fct:busca-rapida", abrirPorEvento);
    return () => {
      window.removeEventListener("keydown", atalho);
      window.removeEventListener("fct:busca-rapida", abrirPorEvento);
    };
  }, [variante]);

  React.useEffect(() => {
    document.getElementById(`${idLista}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, idLista]);

  const fechar = () => {
    setAberta(false);
    setTermo("");
    setAtivo(0);
  };
  const abrir = (href: string) => {
    fechar();
    router.push(href);
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = filtrados.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => (n ? (a + 1) % n : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (n ? (a - 1 + n) % n : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setAtivo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setAtivo(Math.max(0, n - 1));
    } else if (e.key === "Enter" && filtrados[ativo]) {
      e.preventDefault();
      abrir(filtrados[ativo].href);
    }
  };

  const botao =
    variante === "menu" ? (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("fct:busca-rapida"))}
        className="mx-3 mb-3 flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-sm text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        aria-keyshortcuts="Control+K"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Buscar tela…</span>
        <kbd aria-hidden className="rounded border border-sidebar-border px-1.5 font-sans text-[11px] text-sidebar-foreground/70">
          Ctrl K
        </kbd>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-input/60 bg-card px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-56 sm:px-3 lg:hidden"
        aria-keyshortcuts="Control+K"
      >
        <Search className="size-4" aria-hidden />
        <span className="sr-only flex-1 text-left sm:not-sr-only">Buscar tela…</span>
        <kbd aria-hidden className="hidden rounded border bg-muted px-1.5 font-sans text-[11px] sm:inline">
          Ctrl K
        </kbd>
      </button>
    );

  if (variante === "menu") return botao;

  return (
    <>
      {botao}
      <Dialog open={aberta} onOpenChange={(v) => (v ? setAberta(true) : fechar())}>
        <DialogContent showCloseButton={false} className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Buscar tela</DialogTitle>
          <DialogDescription className="sr-only">Digite para filtrar. Setas para escolher, Enter para abrir, Esc para fechar.</DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={teclas}
              role="combobox"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={filtrados[ativo] ? `${idLista}-${ativo}` : undefined}
              aria-label="Buscar tela"
              placeholder="Buscar tela… (ex.: folha, conciliação, chamados)"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={idLista} role="listbox" aria-label="Telas" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
            {filtrados.map((i, k) => {
              const Icone = i.icon;
              return (
                <li
                  key={i.href}
                  id={`${idLista}-${k}`}
                  role="option"
                  aria-selected={k === ativo}
                  onMouseMove={() => setAtivo(k)}
                  onClick={() => abrir(i.href)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", k === ativo && "bg-accent")}
                >
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", k === ativo ? "bg-fct-navy text-white" : "bg-muted text-fct-navy")}>
                    <Icone className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.grupo} · {i.descricao}
                    </span>
                  </span>
                  {k === ativo && <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </li>
              );
            })}
            {filtrados.length === 0 && (
              <li role="presentation" className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nenhuma tela encontrada para “{termo}”.
              </li>
            )}
          </ul>
          <p className="border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            <kbd className="font-sans font-semibold">↑ ↓</kbd> escolher · <kbd className="font-sans font-semibold">Enter</kbd> abrir ·{" "}
            <kbd className="font-sans font-semibold">Esc</kbd> fechar · <kbd className="font-sans font-semibold">/</kbd> ou{" "}
            <kbd className="font-sans font-semibold">Ctrl K</kbd> de qualquer tela
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
