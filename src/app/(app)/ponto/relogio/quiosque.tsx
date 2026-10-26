"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, Delete, Expand, Shrink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";
import { ICONE_TIPO_CLIENTE } from "../_ui/icones-tipo";
import { RelogioDigital } from "../_ui/relogio-digital";
import type { Identificado, ResultadoRegistro } from "../registrar/actions";

type Props = {
  filial: { id: string; codigo: string; nome: string };
  identificar: (filial: string, matricula: string) => Promise<Identificado>;
  registrar: (employeeId: string, pin: string, tipo: string | null) => Promise<ResultadoRegistro>;
};

type Etapa = "matricula" | "pin" | "tipo" | "ok";
type Pessoa = Extract<Identificado, { ok: true }>;

const OCIOSO_MS = 30_000;
const CONFIRMACAO_MS = 6_000;

/** Relógio da filial: matrícula → PIN → tipo → confirmação. Volta ao início sozinho. */
export function Quiosque({ filial, identificar, registrar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("matricula");
  const [digitos, setDigitos] = useState("");
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoRegistro, { ok: true }> | null>(null);
  const [pendente, iniciar] = useTransition();
  const [telaCheia, setTelaCheia] = useState(false);
  const ocioso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reiniciar = useCallback(() => {
    setEtapa("matricula");
    setDigitos("");
    setPin("");
    setPessoa(null);
    setResultado(null);
  }, []);

  // volta ao início depois de um tempo parado (ou da confirmação)
  useEffect(() => {
    if (ocioso.current) clearTimeout(ocioso.current);
    if (etapa === "matricula" && !digitos) return;
    ocioso.current = setTimeout(
      () => {
        reiniciar();
        setErro(null);
      },
      etapa === "ok" ? CONFIRMACAO_MS : OCIOSO_MS,
    );
    return () => {
      if (ocioso.current) clearTimeout(ocioso.current);
    };
  }, [etapa, digitos, pin, reiniciar]);

  useEffect(() => {
    const f = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const confirmarMatricula = useCallback(() => {
    if (!digitos) return;
    setErro(null);
    iniciar(async () => {
      const r = await identificar(filial.id, digitos);
      if (!r.ok) {
        setErro(r.erro);
        setDigitos("");
        return;
      }
      if (!r.temPin) {
        setErro(`${r.nome}, você ainda não tem PIN. Peça ao gestor para cadastrar (ou cadastre em “Meu ponto”).`);
        setDigitos("");
        return;
      }
      setPessoa(r);
      setEtapa("pin");
    });
  }, [digitos, filial.id, identificar]);

  const confirmarPin = useCallback(() => {
    if (pin.length < 4) return;
    setErro(null);
    setEtapa("tipo");
  }, [pin]);

  const registrarTipo = useCallback(
    (tipo: TipoMarcacao) => {
      if (!pessoa) return;
      setErro(null);
      iniciar(async () => {
        const r = await registrar(pessoa.id, pin, tipo);
        if (r.ok) {
          setResultado(r);
          setEtapa("ok");
          return;
        }
        setErro(r.erro);
        setPin("");
        setEtapa(/PIN/i.test(r.erro) && !/bloqueado/i.test(r.erro) ? "pin" : "matricula");
        if (!/PIN/i.test(r.erro) || /bloqueado/i.test(r.erro)) {
          setDigitos("");
          setPessoa(null);
        }
      });
    },
    [pessoa, pin, registrar],
  );

  const tecla = useCallback(
    (t: string) => {
      if (pendente || etapa === "ok" || etapa === "tipo") return;
      const valor = etapa === "matricula" ? digitos : pin;
      const set = etapa === "matricula" ? setDigitos : setPin;
      const max = etapa === "matricula" ? 12 : 6;
      if (t === "apagar") set(valor.slice(0, -1));
      else if (t === "ok") (etapa === "matricula" ? confirmarMatricula : confirmarPin)();
      else if (/^\d$/.test(t) && valor.length < max) set(valor + t);
    },
    [confirmarMatricula, confirmarPin, digitos, etapa, pendente, pin],
  );

  // teclado físico
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") tecla(e.key);
      else if (e.key === "Backspace") tecla("apagar");
      else if (e.key === "Enter") tecla("ok");
      else if (e.key === "Escape") reiniciar();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [tecla, reiniciar]);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-2xl border bg-card px-5 py-6 shadow-sm">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="font-mono text-fct-tinta">{filial.codigo}</span> {filial.nome}
        </p>
        <Button type="button" size="icon-sm" variant="ghost" onClick={alternarTelaCheia} aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}>
          {telaCheia ? <Shrink aria-hidden /> : <Expand aria-hidden />}
        </Button>
      </div>
      <RelogioDigital grande />

      {etapa === "ok" && resultado ? (
        <div role="status" className="flex w-full flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center text-emerald-900">
          <CircleCheck className="size-14 text-emerald-600" aria-hidden />
          <p className="text-2xl font-semibold">{resultado.texto}</p>
          <p className="text-lg">{resultado.nome}</p>
          <p className="text-xs text-emerald-800">Comprovante nº {resultado.nsr}</p>
          <Button variant="outline" onClick={reiniciar} className="mt-2">
            Próximo
          </Button>
        </div>
      ) : etapa === "tipo" && pessoa ? (
        <div className="w-full space-y-3">
          <p className="text-center text-lg">
            Olá, <strong>{pessoa.nome.split(" ")[0]}</strong>! O que você vai registrar?
          </p>
          {pessoa.ultima && <p className="text-center text-xs text-muted-foreground">Última hoje: {pessoa.ultima}</p>}
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_MARCACAO.map((t) => {
              const Icone = ICONE_TIPO_CLIENTE[t];
              const sugerido = t === pessoa.sugestao;
              return (
                <Button key={t} type="button" size="lg" variant={sugerido ? "default" : "outline"} disabled={pendente} onClick={() => registrarTipo(t)} className={cn("h-20 flex-col gap-1 text-base", sugerido && "ring-2 ring-offset-2")}>
                  <Icone className="size-6" aria-hidden />
                  {TIPO_MARCACAO_LABEL[t]}
                </Button>
              );
            })}
          </div>
          <Button type="button" variant="ghost" className="w-full" onClick={reiniciar}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="w-full space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{etapa === "matricula" ? "Digite sua matrícula" : `${pessoa?.nome.split(" ")[0]}, digite seu PIN`}</p>
            <p className="mt-2 flex h-12 items-center justify-center rounded-xl border bg-background text-3xl font-semibold tracking-[0.3em] tabular-nums" aria-live="polite">
              {etapa === "matricula" ? digitos || <span className="text-muted-foreground/40">——</span> : "•".repeat(pin.length) || <span className="text-muted-foreground/40">••••</span>}
            </p>
          </div>
          {erro && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {erro}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "apagar", "0", "ok"].map((t) => (
              <Button
                key={t}
                type="button"
                variant={t === "ok" ? "default" : "outline"}
                disabled={pendente}
                onClick={() => tecla(t)}
                className="h-16 text-2xl font-semibold"
                aria-label={t === "apagar" ? "Apagar" : t === "ok" ? "Confirmar" : t}
              >
                {t === "apagar" ? <Delete className="size-6" aria-hidden /> : t === "ok" ? (pendente ? "…" : "OK") : t}
              </Button>
            ))}
          </div>
          {etapa === "pin" && (
            <Button type="button" variant="ghost" className="w-full" onClick={reiniciar}>
              Não sou {pessoa?.nome.split(" ")[0]}
            </Button>
          )}
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">Data, hora, filial e aparelho ficam gravados. 5 PINs errados bloqueiam por 15 minutos.</p>
    </div>
  );
}
