"use client";

import * as React from "react";
import { Plus, Send, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextoIa } from "./texto-ia";

export type MensagemChat = { papel: "user" | "assistant"; texto: string };

type Props = {
  conversaInicial: string | null;
  mensagensIniciais: MensagemChat[];
  sugestoes: string[];
  gastoHoje: number;
  limiteDia: number;
  maxCaracteres: number;
};

const dolar = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ChatAssistente({ conversaInicial, mensagensIniciais, sugestoes, gastoHoje, limiteDia, maxCaracteres }: Props) {
  const [conversa, setConversa] = React.useState(conversaInicial);
  const [mensagens, setMensagens] = React.useState(mensagensIniciais);
  const [texto, setTexto] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [gasto, setGasto] = React.useState(gastoHoje);
  const lista = React.useRef<HTMLDivElement>(null);
  const parar = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensagens, status, erro]);

  const somarNaResposta = (v: string) =>
    setMensagens((m) => {
      const ultima = m[m.length - 1];
      return ultima?.papel === "assistant" ? [...m.slice(0, -1), { ...ultima, texto: ultima.texto + v }] : [...m, { papel: "assistant", texto: v }];
    });

  const perguntar = async (pergunta: string) => {
    const limpa = pergunta.trim();
    if (!limpa || enviando) return;
    setErro(null);
    setAviso(null);
    setTexto("");
    setEnviando(true);
    setStatus("Pensando");
    setMensagens((m) => [...m, { papel: "user", texto: limpa }]);
    const controle = new AbortController();
    parar.current = controle;
    try {
      const r = await fetch("/api/assistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: limpa, conversa }), signal: controle.signal });
      if (!r.ok || !r.body) {
        const corpo = await r.json().catch(() => null);
        throw new Error(corpo?.erro ?? "Não consegui responder agora. Tente de novo.");
      }
      const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += value;
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha) continue;
          const e = JSON.parse(linha);
          if (e.t === "texto") {
            setStatus(null);
            somarNaResposta(e.v);
          } else if (e.t === "status") setStatus(e.v);
          else if (e.t === "erro") setErro(e.v);
          else if (e.t === "fim") {
            setConversa(e.conversa);
            setGasto(e.gastoHoje);
            if (e.aviso) setAviso(e.aviso);
          }
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setErro(e instanceof Error ? e.message : "Não consegui responder agora. Tente de novo.");
    } finally {
      setEnviando(false);
      setStatus(null);
      parar.current = null;
    }
  };

  const novaConversa = () => {
    parar.current?.abort();
    setConversa(null);
    setMensagens([]);
    setErro(null);
    setAviso(null);
  };

  return (
    <section className="flex h-[calc(100dvh-15rem)] min-h-[28rem] flex-col rounded-xl border bg-card">
      <div ref={lista} role="log" aria-label="Conversa com o assistente" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {mensagens.length === 0 && (
          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-4">
            <div className="text-center">
              <span className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-6 ring-muted/50">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="font-medium">O que você quer saber da rede?</p>
              <p className="text-sm text-muted-foreground">Vendas, quebras de caixa, conciliação, pendências e DRE. Eu só consulto, não altero nada.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => perguntar(s)} className="cartao-interativo rounded-xl border bg-background p-3 text-left text-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) =>
          m.papel === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">{m.texto}</p>
            </div>
          ) : (
            <div key={i} className="max-w-full text-sm leading-relaxed sm:max-w-[92%]">
              <TextoIa texto={m.texto} />
            </div>
          ),
        )}
        {status && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Sparkles className="size-3.5 animate-pulse" aria-hidden />
            {status}…
          </p>
        )}
        {aviso && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">{aviso}</p>}
        {erro && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {erro}
          </p>
        )}
      </div>
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                perguntar(texto);
              }
            }}
            rows={2}
            maxLength={maxCaracteres}
            placeholder="Escreva sua pergunta…"
            aria-label="Sua pergunta"
            className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
          {enviando ? (
            <Button type="button" variant="outline" onClick={() => parar.current?.abort()}>
              <Square data-icon="inline-start" />
              Parar
            </Button>
          ) : (
            <Button type="submit" disabled={!texto.trim()}>
              <Send data-icon="inline-start" />
              Enviar
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Usado hoje: {dolar(gasto)} de {dolar(limiteDia)}. As perguntas e os dados consultados vão para a Anthropic, a empresa da IA, para gerar a resposta.
          </span>
          {mensagens.length > 0 && (
            <button type="button" onClick={novaConversa} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium transition-colors hover:bg-muted hover:text-foreground">
              <Plus className="size-3.5" aria-hidden />
              Nova conversa
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
