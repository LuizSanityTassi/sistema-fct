"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CircleCheck, Delete, Expand, Fingerprint, Shrink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "@/lib/ponto/calculo";
import { conferirDigital, parearLeitor, verLeitor } from "@/lib/ponto/leitor-digital";
import { cn } from "@/lib/utils";
import { ICONE_TIPO_CLIENTE } from "../_ui/icones-tipo";
import { RelogioDigital } from "../_ui/relogio-digital";
import type { Identificado, LeituraAberta, ResultadoRegistro } from "../registrar/actions";
import type { LeitorAtivado } from "./actions";

type Props = {
  filial: { id: string; codigo: string; nome: string };
  identificar: (filial: string, matricula: string) => Promise<Identificado>;
  registrar: (employeeId: string, pin: string, tipo: string | null) => Promise<ResultadoRegistro>;
  iniciarDigital: (employeeId: string, leitorId: string) => Promise<LeituraAberta>;
  registrarDigital: (desafio: string, dedo: number, assinatura: string, tipo: string | null) => Promise<ResultadoRegistro>;
  ativarLeitor: (filial: string, codigo: string) => Promise<LeitorAtivado>;
};

type Etapa = "matricula" | "digital" | "pin" | "tipo" | "ok";
type Pessoa = Extract<Identificado, { ok: true }>;
type Prova = { desafio: string; dedo: number; assinatura: string };

const OCIOSO_MS = 30_000;
const CONFIRMACAO_MS = 6_000;

function AvisoErro({ texto }: { texto: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-800">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

/** Aparece quando o programa do leitor está no computador e ainda não foi ativado: o código vem de Ponto > Relógio da filial. */
function AtivarLeitor({ filial, ativar, ativado }: { filial: string; ativar: Props["ativarLeitor"]; ativado: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!aberto)
    return (
      <Button type="button" size="xs" variant="ghost" onClick={() => setAberto(true)}>
        <Fingerprint aria-hidden /> Ativar leitor de digital
      </Button>
    );
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await ativar(filial, codigo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      try {
        await parearLeitor(r.id, r.segredo);
        ativado(r.id);
      } catch (falha) {
        setErro(falha instanceof Error ? falha.message : "Não consegui ativar o leitor neste computador.");
      }
    });
  };
  return (
    <form onSubmit={enviar} className="w-full space-y-2 rounded-lg border bg-background p-3">
      <label htmlFor="codigo-leitor" className="block text-sm font-medium">
        Código de ativação do leitor
      </label>
      <div className="flex gap-2">
        <input id="codigo-leitor" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} autoComplete="off" autoFocus className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm tracking-widest select-text" />
        <Button type="submit" disabled={pendente || !codigo.trim()}>
          {pendente ? "Ativando…" : "Ativar"}
        </Button>
      </div>
      {erro && <AvisoErro texto={erro} />}
    </form>
  );
}

/** Relógio da filial: matrícula → dedo ou PIN → tipo → confirmação. Volta ao início sozinho. */
export function Quiosque({ filial, identificar, registrar, iniciarDigital, registrarDigital, ativarLeitor }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("matricula");
  const [digitos, setDigitos] = useState("");
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoRegistro, { ok: true }> | null>(null);
  const [pendente, iniciar] = useTransition();
  const [telaCheia, setTelaCheia] = useState(false);
  const [leitor, setLeitor] = useState<{ id: string | null } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [prova, setProva] = useState<Prova | null>(null);
  const ocioso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leitura = useRef(0);

  const reiniciar = useCallback(() => {
    leitura.current += 1;
    setLendo(false);
    setProva(null);
    setEtapa("matricula");
    setDigitos("");
    setPin("");
    setPessoa(null);
    setResultado(null);
  }, []);

  useEffect(() => {
    let vale = true;
    verLeitor().then((r) => {
      if (vale) setLeitor(r.leitor ? { id: r.leitorId ?? null } : null);
    });
    return () => {
      vale = false;
    };
  }, []);

  const lerDedo = useCallback(
    (alvo: Pessoa, leitorId: string) => {
      const minha = ++leitura.current;
      setErro(null);
      setLendo(true);
      setEtapa("digital");
      void (async () => {
        try {
          const aberta = await iniciarDigital(alvo.id, leitorId);
          if (!aberta.ok) throw new Error(aberta.erro);
          const conferida = await conferirDigital(aberta);
          if (minha !== leitura.current) return;
          setProva({ desafio: aberta.desafio, dedo: conferida.dedo, assinatura: conferida.assinatura });
          setEtapa("tipo");
        } catch (falha) {
          if (minha === leitura.current) setErro(falha instanceof Error ? falha.message : "Não consegui conferir a digital. Tente de novo.");
        } finally {
          if (minha === leitura.current) setLendo(false);
        }
      })();
    },
    [iniciarDigital],
  );

  const usarPin = useCallback(() => {
    leitura.current += 1;
    setLendo(false);
    setErro(null);
    setEtapa("pin");
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
  }, [etapa, digitos, pin, lendo, reiniciar]);

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
      // quem tem digital bate com o dedo se o leitor deste computador estiver pronto; o PIN fica de reserva
      let leitorId: string | null = null;
      if (r.temDigital) {
        const v = await verLeitor();
        setLeitor(v.leitor ? { id: v.leitorId ?? null } : null);
        leitorId = v.leitor ? (v.leitorId ?? null) : null;
      }
      if (leitorId) {
        setPessoa(r);
        lerDedo(r, leitorId);
        return;
      }
      if (!r.temPin) {
        setErro(r.temDigital ? `${r.nome}, o leitor de digital não está pronto neste computador e você ainda não tem PIN. Chame o gestor.` : `${r.nome}, você ainda não tem PIN. Peça ao gestor para cadastrar (ou cadastre em “Meu ponto”).`);
        setDigitos("");
        return;
      }
      setPessoa(r);
      setEtapa("pin");
    });
  }, [digitos, filial.id, identificar, lerDedo]);

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
        const r = prova ? await registrarDigital(prova.desafio, prova.dedo, prova.assinatura, tipo) : await registrar(pessoa.id, pin, tipo);
        setProva(null);
        if (r.ok) {
          setResultado(r);
          setEtapa("ok");
          return;
        }
        setErro(r.erro);
        setPin("");
        const errouPin = !prova && /PIN/i.test(r.erro) && !/bloqueado/i.test(r.erro);
        setEtapa(errouPin ? "pin" : "matricula");
        if (!errouPin) {
          setDigitos("");
          setPessoa(null);
        }
      });
    },
    [pessoa, pin, prova, registrar, registrarDigital],
  );

  const tecla = useCallback(
    (t: string) => {
      if (pendente || etapa === "ok" || etapa === "tipo" || etapa === "digital") return;
      const valor = etapa === "matricula" ? digitos : pin;
      const set = etapa === "matricula" ? setDigitos : setPin;
      const max = etapa === "matricula" ? 12 : 6;
      if (t === "apagar") set(valor.slice(0, -1));
      else if (t === "ok") (etapa === "matricula" ? confirmarMatricula : confirmarPin)();
      else if (/^\d$/.test(t) && valor.length < max) set(valor + t);
    },
    [confirmarMatricula, confirmarPin, digitos, etapa, pendente, pin],
  );

  // teclado físico (fora de campos de texto: a senha de "Sair do relógio" não vira matrícula)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=dialog]")) return;
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
      ) : etapa === "digital" && pessoa ? (
        <div className="w-full space-y-3 text-center">
          <p className="text-lg">
            Olá, <strong>{pessoa.nome.split(" ")[0]}</strong>!
          </p>
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-background px-5 py-8" role="status">
            <Fingerprint className={cn("size-16 text-fct-red", lendo && "motion-safe:animate-pulse")} aria-hidden />
            <p className="text-lg font-medium">{lendo ? "Coloque o dedo no leitor" : "Não deu certo"}</p>
          </div>
          {erro && <AvisoErro texto={erro} />}
          {!lendo && leitor?.id && (
            <Button type="button" size="lg" className="w-full" onClick={() => lerDedo(pessoa, leitor.id as string)}>
              <Fingerprint aria-hidden /> Tentar de novo
            </Button>
          )}
          {pessoa.temPin && (
            <Button type="button" variant="outline" className="w-full" onClick={usarPin}>
              Usar o PIN
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={reiniciar}>
            Não sou {pessoa.nome.split(" ")[0]}
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
          {erro && <AvisoErro texto={erro} />}
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
      {etapa === "matricula" && leitor && !leitor.id && <AtivarLeitor filial={filial.id} ativar={ativarLeitor} ativado={(id) => setLeitor({ id })} />}
      <p className="text-center text-xs text-muted-foreground">Data, hora, filial e aparelho ficam gravados. 5 PINs errados bloqueiam por 15 minutos.</p>
    </div>
  );
}
