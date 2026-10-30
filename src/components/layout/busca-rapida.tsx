"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, ClipboardList, CornerDownLeft, LifeBuoy, Loader2, MessageCircleQuestion, MonitorCog, Search, Store, UserCog, Users, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buscaValida, type GrupoBusca, type TipoBusca } from "@/lib/busca";
import { navParaPapel } from "@/lib/nav";
import { perguntasDoPapel } from "@/lib/perguntas/catalogo";
import type { AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ICONE_TIPO: Record<TipoBusca, LucideIcon> = {
  funcionario: Users,
  filial: Building2,
  chamado: LifeBuoy,
  ativo: MonitorCog,
  pendencia: ClipboardList,
  fornecedor: Store,
  caixa: Banknote,
  usuario: UserCog,
};

type Opcao = { chave: string; href: string; titulo: string; detalhe: string; situacao?: string | null; icone: LucideIcon };
type Secao = { rotulo: string | null; opcoes: Opcao[] };

/**
 * Busca global (Ctrl+K, ⌘K ou "/"): telas que o papel do usuário pode abrir e, a partir de 2 letras, funcionários,
 * filiais, chamados, equipamentos, pendências, fornecedores, caixas e usuários (só o que ele pode ver).
 * Padrão combobox + listbox (setas, Enter, Esc) para teclado e leitor de tela.
 */
export function BuscaRapida({ papel, extras, bloqueios }: { papel: AppRole; extras?: string[]; bloqueios?: string[] }) {
  const router = useRouter();
  const [aberta, setAberta] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const [grupos, setGrupos] = React.useState<GrupoBusca[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const idLista = React.useId();
  const espera = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedido = React.useRef<AbortController | null>(null);

  const itens = React.useMemo(() => navParaPapel(papel, extras, bloqueios).flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo ?? "Início" }))), [papel, extras, bloqueios]);
  const telas = React.useMemo(() => {
    const t = normalizar(termo.trim());
    if (!t) return itens;
    const palavras = t.split(/\s+/);
    return itens
      .filter((i) => {
        const alvo = normalizar(`${i.label} ${i.grupo} ${i.descricao}`);
        return palavras.every((p) => alvo.includes(p));
      })
      .sort((a, b) => Number(!normalizar(a.label).includes(palavras[0])) - Number(!normalizar(b.label).includes(palavras[0])))
      .slice(0, 6);
  }, [termo, itens]);
  // perguntas prontas entram quando há termo (sem termo, a lista de telas já mostra "Perguntas prontas")
  const todasPerguntas = React.useMemo(() => perguntasDoPapel(papel, bloqueios), [papel, bloqueios]);
  const perguntas = React.useMemo(() => {
    const t = normalizar(termo.trim());
    if (!t) return [];
    const palavras = t.split(/\s+/);
    return todasPerguntas.filter((p) => palavras.every((w) => normalizar(`${p.pergunta} ${p.area} ${p.descricao}`).includes(w))).slice(0, 4);
  }, [termo, todasPerguntas]);

  const secoes = React.useMemo<Secao[]>(() => {
    const deTelas: Opcao[] = telas.map((i) => ({ chave: `tela:${i.href}`, href: i.href, titulo: i.label, detalhe: `${i.grupo} · ${i.descricao}`, icone: i.icon }));
    const lista: Secao[] = deTelas.length ? [{ rotulo: termo.trim() ? "Telas" : null, opcoes: deTelas }] : [];
    if (perguntas.length)
      lista.push({
        rotulo: "Perguntas prontas",
        opcoes: perguntas.map((p) => ({ chave: `pergunta:${p.id}`, href: `/perguntas/${p.id}`, titulo: p.pergunta, detalhe: `${p.area} · ${p.descricao}`, icone: MessageCircleQuestion })),
      });
    for (const g of grupos) {
      lista.push({
        rotulo: g.rotulo,
        opcoes: g.itens.map((i) => ({ chave: `${i.tipo}:${i.id}`, href: i.href, titulo: i.titulo, detalhe: i.detalhe, situacao: i.situacao, icone: ICONE_TIPO[i.tipo] })),
      });
    }
    return lista;
  }, [telas, perguntas, grupos, termo]);
  const opcoes = React.useMemo(() => secoes.flatMap((s) => s.opcoes), [secoes]);
  const atual = opcoes.length ? Math.min(ativo, opcoes.length - 1) : 0;

  React.useEffect(() => {
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
  }, []);

  React.useEffect(() => {
    document.getElementById(`${idLista}-${atual}`)?.scrollIntoView({ block: "nearest" });
  }, [atual, idLista]);

  const cancelarBusca = () => {
    if (espera.current) clearTimeout(espera.current);
    pedido.current?.abort();
    espera.current = null;
    pedido.current = null;
  };

  // busca nos dados 250 ms depois da última tecla; a anterior é cancelada
  const digitar = (valor: string) => {
    setTermo(valor);
    setAtivo(0);
    cancelarBusca();
    if (!buscaValida(valor)) {
      setGrupos([]);
      setBuscando(false);
      setErro(null);
      return;
    }
    setBuscando(true);
    espera.current = setTimeout(async () => {
      const controle = new AbortController();
      pedido.current = controle;
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(valor.trim())}`, { signal: controle.signal, headers: { Accept: "application/json" } });
        // sessão expirada: o proxy manda para o login (HTML) em vez do JSON
        if (r.redirected || !r.headers.get("content-type")?.includes("json")) {
          setGrupos([]);
          setErro("Sua sessão expirou. Entre de novo para buscar nos dados.");
          setBuscando(false);
          return;
        }
        const corpo = (await r.json()) as { grupos?: GrupoBusca[]; erro?: string };
        if (controle.signal.aborted) return;
        setGrupos(corpo.grupos ?? []);
        setErro(r.ok ? null : (corpo.erro ?? "Não consegui buscar agora."));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setGrupos([]);
        setErro("Não consegui buscar agora. Confira a conexão.");
      }
      setBuscando(false);
    }, 250);
  };

  const fechar = () => {
    cancelarBusca();
    setAberta(false);
    setTermo("");
    setAtivo(0);
    setGrupos([]);
    setBuscando(false);
    setErro(null);
  };
  const abrir = (href: string) => {
    fechar();
    router.push(href);
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = opcoes.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo(n ? (atual + 1) % n : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo(n ? (atual - 1 + n) % n : 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      setAtivo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setAtivo(Math.max(0, n - 1));
    } else if (e.key === "Enter" && opcoes[atual]) {
      e.preventDefault();
      abrir(opcoes[atual].href);
    }
  };

  const botao = (
    <button
      type="button"
      onClick={() => setAberta(true)}
      className="flex h-8 items-center gap-2 rounded-lg border bg-card px-2 text-sm text-muted-foreground shadow-xs transition-colors outline-none hover:border-borda-forte hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-56 sm:px-2.5 lg:w-72"
      aria-keyshortcuts="Control+K"
    >
      <Search className="size-4" aria-hidden />
      <span className="sr-only flex-1 truncate text-left sm:not-sr-only">Buscar no sistema…</span>
      <kbd aria-hidden className="hidden rounded border bg-muted px-1.5 font-sans text-[10.5px] font-medium sm:inline">
        Ctrl K
      </kbd>
    </button>
  );


  const temTermo = buscaValida(termo);
  const inicioSecao = secoes.map((_, i) => secoes.slice(0, i).reduce((s, x) => s + x.opcoes.length, 0));
  return (
    <>
      {botao}
      <Dialog open={aberta} onOpenChange={(v) => (v ? setAberta(true) : fechar())}>
        <DialogContent showCloseButton={false} className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Busca</DialogTitle>
          <DialogDescription className="sr-only">
            Digite para buscar telas e, a partir de 2 letras, funcionários, filiais, chamados, equipamentos, pendências, fornecedores e caixas. Setas para escolher, Enter para abrir, Esc para fechar.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            {buscando ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <input
              autoFocus
              value={termo}
              onChange={(e) => digitar(e.target.value)}
              onKeyDown={teclas}
              role="combobox"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={opcoes[atual] ? `${idLista}-${atual}` : undefined}
              aria-label="Buscar"
              placeholder="Buscar telas, funcionários, filiais, chamados, equipamentos…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <p role="status" className="sr-only">
            {buscando ? "Buscando…" : temTermo ? `${opcoes.length} resultado(s)` : ""}
          </p>
          <ul id={idLista} role="listbox" aria-label="Resultados" className="max-h-[min(62vh,30rem)] overflow-y-auto p-2">
            {secoes.map((s, si) => (
              <React.Fragment key={s.rotulo ?? "telas"}>
                {s.rotulo && (
                  <li role="presentation" className="px-3 pt-3 pb-1 rotulo first:pt-1">
                    {s.rotulo}
                  </li>
                )}
                {s.opcoes.map((o, oi) => {
                  const indice = inicioSecao[si] + oi;
                  const Icone = o.icone;
                  const selecionado = indice === atual;
                  return (
                    <li
                      key={o.chave}
                      id={`${idLista}-${indice}`}
                      role="option"
                      aria-selected={selecionado}
                      onMouseMove={() => setAtivo(indice)}
                      onClick={() => abrir(o.href)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", selecionado && "bg-accent")}
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", selecionado ? "bg-primary text-primary-foreground" : "bg-muted text-fct-tinta")}>
                        <Icone className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{o.titulo}</span>
                        {o.detalhe && <span className="block truncate text-xs text-muted-foreground">{o.detalhe}</span>}
                      </span>
                      {o.situacao && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{o.situacao}</span>}
                      {selecionado && <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    </li>
                  );
                })}
              </React.Fragment>
            ))}
            {opcoes.length === 0 && (
              <li role="presentation" className="px-3 py-8 text-center text-sm text-muted-foreground">
                {buscando ? "Buscando…" : erro ? erro : `Nada encontrado para “${termo}”.`}
              </li>
            )}
            {opcoes.length > 0 && erro && (
              <li role="presentation" className="px-3 py-2 text-xs text-red-700">
                {erro}
              </li>
            )}
          </ul>
          <p className="border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            {!temTermo && <span className="mr-1">Digite 2 letras para buscar também funcionários, filiais, chamados (#número), equipamentos, pendências e caixas (número do caixa).</span>}
            <kbd className="font-sans font-semibold">↑ ↓</kbd> escolher · <kbd className="font-sans font-semibold">Enter</kbd> abrir · <kbd className="font-sans font-semibold">Esc</kbd> fechar ·{" "}
            <kbd className="font-sans font-semibold">/</kbd> ou <kbd className="font-sans font-semibold">Ctrl K</kbd> de qualquer tela
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
