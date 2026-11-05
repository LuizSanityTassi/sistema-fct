"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CircleCheck, Delete, Expand, Fingerprint, Shrink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIPO_MARCACAO_LABEL, TIPOS_NORMAIS, type TipoMarcacao } from "@/lib/ponto/calculo";
import { esperarDedo, identificarDigital as identificarNoLeitor, parearLeitor, verLeitor, VERSAO_SO_DEDO } from "@/lib/ponto/leitor-digital";
import { cn } from "@/lib/utils";
import { ICONE_TIPO_CLIENTE } from "../_ui/icones-tipo";
import { RelogioDigital } from "../_ui/relogio-digital";
import type { Identificado, LeituraAberta, ResultadoRegistro } from "../registrar/actions";
import type { LeitorAtivado } from "./actions";

type Props = {
  filial: { id: string; codigo: string; nome: string };
  identificar: (filial: string, matricula: string) => Promise<Identificado>;
  registrar: (employeeId: string, pin: string, tipo: string | null) => Promise<ResultadoRegistro>;
  iniciarLeitura: (filial: string, leitorId: string) => Promise<LeituraAberta>;
  identificarDigital: (desafio: string, employeeId: string, dedo: number, assinatura: string) => Promise<Identificado>;
  registrarDigital: (desafio: string, dedo: number, assinatura: string, tipo: string | null) => Promise<ResultadoRegistro>;
  ativarLeitor: (filial: string, codigo: string) => Promise<LeitorAtivado>;
};

type Etapa = "dedo" | "matricula" | "pin" | "tipo" | "ok";
type Pessoa = Extract<Identificado, { ok: true }>;
type Prova = { desafio: string; dedo: number; assinatura: string };
type EstadoLeitor = { id: string | null; versao: number };

const OCIOSO_MS = 30_000;
const CONFIRMACAO_MS = 6_000;
/** Depois de um erro, o tempo para a pessoa ler e tirar o dedo. */
const PAUSA_ERRO_MS = 2_500;
const PAUSA_TELA_ESCONDIDA_MS = 1_000;
const CONFERIR_LEITOR_MS = 30_000;

const pausa = (ms: number) => new Promise((fim) => setTimeout(fim, ms));

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

/** Relógio da filial: dedo → tipo → confirmação. Sem leitor pronto, ou por escolha da pessoa: matrícula → PIN → tipo. Volta ao início sozinho. */
export function Quiosque({ filial, identificar, registrar, iniciarLeitura, identificarDigital, registrarDigital, ativarLeitor }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("matricula");
  const [digitos, setDigitos] = useState("");
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoRegistro, { ok: true }> | null>(null);
  const [pendente, iniciar] = useTransition();
  const [telaCheia, setTelaCheia] = useState(false);
  const [leitor, setLeitor] = useState<EstadoLeitor | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [prova, setProva] = useState<Prova | null>(null);
  const ocioso = useRef<ReturnType<typeof setTimeout> | null>(null);

  // só com o programa novo e ativado dá para descobrir a pessoa pelo dedo
  const leitorDoDedo = leitor?.id && leitor.versao >= VERSAO_SO_DEDO ? leitor.id : null;
  const inicio: Etapa = leitorDoDedo ? "dedo" : "matricula";

  const reiniciar = useCallback(() => {
    setProva(null);
    setEtapa(inicio);
    setDigitos("");
    setPin("");
    setPessoa(null);
    setResultado(null);
  }, [inicio]);

  // o computador pode ligar antes do programa ou do leitor: sem leitor pronto, confere de tempos em tempos
  useEffect(() => {
    if (leitorDoDedo) return;
    let vale = true;
    const conferir = () =>
      verLeitor().then((r) => {
        if (!vale) return;
        setLeitor(r.leitor ? { id: r.leitorId ?? null, versao: r.versao ?? 1 } : null);
        if (r.leitor && r.leitorId && (r.versao ?? 1) >= VERSAO_SO_DEDO) setEtapa((e) => (e === "matricula" ? "dedo" : e));
      });
    void conferir();
    const t = setInterval(conferir, CONFERIR_LEITOR_MS);
    return () => {
      vale = false;
      clearInterval(t);
    };
  }, [leitorDoDedo]);

  // fica esperando o dedo enquanto esta tela estiver aberta; a espera é só com o programa do leitor, o servidor entra quando há dedo
  useEffect(() => {
    if (etapa !== "dedo" || !leitorDoDedo) return;
    let vale = true;
    void (async () => {
      while (vale) {
        // com a tela escondida, deixa o leitor livre (para cadastrar digital em outra aba, por exemplo)
        if (document.visibilityState !== "visible") {
          await pausa(PAUSA_TELA_ESCONDIDA_MS);
          continue;
        }
        try {
          const lido = await esperarDedo();
          if (!vale) return;
          if (!lido) {
            setErro(null);
            continue;
          }
          setConferindo(true);
          setErro(null);
          const aberta = await iniciarLeitura(filial.id, leitorDoDedo);
          if (!aberta.ok) throw new Error(aberta.erro);
          const achada = await identificarNoLeitor(aberta);
          const quem = await identificarDigital(aberta.desafio, achada.employee, achada.dedo, achada.assinatura);
          if (!quem.ok) throw new Error(quem.erro);
          if (!vale) return;
          setConferindo(false);
          setPessoa(quem);
          setProva({ desafio: aberta.desafio, dedo: achada.dedo, assinatura: achada.assinatura });
          setEtapa("tipo");
          return;
        } catch (falha) {
          if (!vale) return;
          setConferindo(false);
          setErro(falha instanceof Error ? falha.message : "Não consegui conferir a digital. Tente de novo.");
          await pausa(PAUSA_ERRO_MS);
        }
      }
    })();
    return () => {
      vale = false;
      setConferindo(false);
    };
  }, [etapa, leitorDoDedo, filial.id, iniciarLeitura, identificarDigital]);

  // volta ao início depois de um tempo parado (ou da confirmação)
  useEffect(() => {
    if (ocioso.current) clearTimeout(ocioso.current);
    if (etapa === inicio && !digitos) return;
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
  }, [etapa, inicio, digitos, pin, reiniciar]);

  useEffect(() => {
    const f = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const usarMatricula = useCallback(() => {
    setErro(null);
    setEtapa("matricula");
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
        setErro(r.temDigital ? (leitorDoDedo ? `${r.nome}, você ainda não tem PIN. Bata o ponto com o dedo no leitor.` : `${r.nome}, o leitor de digital não está pronto neste computador e você ainda não tem PIN. Chame o gestor.`) : `${r.nome}, você ainda não tem PIN. Peça ao gestor para cadastrar (ou cadastre em “Meu ponto”).`);
        setDigitos("");
        return;
      }
      setPessoa(r);
      setEtapa("pin");
    });
  }, [digitos, filial.id, identificar, leitorDoDedo]);

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
        setEtapa(errouPin ? "pin" : inicio);
        if (!errouPin) {
          setDigitos("");
          setPessoa(null);
        }
      });
    },
    [inicio, pessoa, pin, prova, registrar, registrarDigital],
  );

  const tecla = useCallback(
    (t: string) => {
      if (pendente || etapa === "ok" || etapa === "tipo" || etapa === "dedo") return;
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

  const leitorAtivado = (id: string) => {
    const versao = leitor?.versao ?? 1;
    setLeitor({ id, versao });
    if (versao >= VERSAO_SO_DEDO) setEtapa("dedo");
  };

  const primeiroNome = pessoa?.nome.split(" ")[0];

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
      ) : etapa === "dedo" ? (
        <div className="w-full space-y-3 text-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-background px-5 py-10" role="status">
            <Fingerprint className="size-20 text-fct-red motion-safe:animate-pulse" aria-hidden />
            <p className="text-xl font-medium">{conferindo ? "Conferindo a digital…" : "Coloque o dedo no leitor"}</p>
          </div>
          {erro && <AvisoErro texto={erro} />}
          <Button type="button" variant="ghost" className="w-full" onClick={usarMatricula}>
            Usar a matrícula e o PIN
          </Button>
        </div>
      ) : etapa === "tipo" && pessoa ? (
        <div className="w-full space-y-3">
          <p className="text-center text-lg">
            Olá, <strong>{primeiroNome}</strong>! O que você vai registrar?
          </p>
          {pessoa.ultima && <p className="text-center text-xs text-muted-foreground">Última hoje: {pessoa.ultima}</p>}
          <div className="grid grid-cols-2 gap-2">
            {[...TIPOS_NORMAIS, ...pessoa.tiposExtra].map((t) => {
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
            {prova ? `Não sou ${primeiroNome}` : "Cancelar"}
          </Button>
        </div>
      ) : (
        <div className="w-full space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{etapa === "matricula" ? "Digite sua matrícula" : `${primeiroNome}, digite seu PIN`}</p>
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
          {etapa === "pin" ? (
            <Button type="button" variant="ghost" className="w-full" onClick={reiniciar}>
              Não sou {primeiroNome}
            </Button>
          ) : (
            leitorDoDedo && (
              <Button type="button" variant="ghost" className="w-full" onClick={reiniciar}>
                <Fingerprint aria-hidden /> Voltar para o dedo
              </Button>
            )
          )}
        </div>
      )}
      {etapa === "matricula" && leitor && !leitor.id && <AtivarLeitor filial={filial.id} ativar={ativarLeitor} ativado={leitorAtivado} />}
      {etapa === "matricula" && leitor?.id && !leitorDoDedo && <p className="text-center text-xs text-amber-700">O programa do leitor deste computador está desatualizado: instale a versão nova para bater o ponto só com o dedo.</p>}
      <p className="text-center text-xs text-muted-foreground">Data, hora, filial e aparelho ficam gravados. 5 PINs errados bloqueiam por 15 minutos.</p>
    </div>
  );
}
