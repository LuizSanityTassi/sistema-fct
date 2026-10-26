"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleCheck, MapPin } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";
import { ICONE_TIPO_CLIENTE } from "../_ui/icones-tipo";
import { RelogioDigital } from "../_ui/relogio-digital";
import type { ResultadoRegistro } from "./actions";

type Coordenadas = { latitude: number; longitude: number; precisao: number } | null;

type Props = {
  sugestao: TipoMarcacao;
  exigeLocalizacao: boolean;
  registrar: (tipo: string | null, coords: Coordenadas) => Promise<ResultadoRegistro>;
};

/** Pede a localização (até 6 s). Sem permissão ou sem GPS, segue sem ela. */
function pegarLocalizacao(): Promise<Coordenadas> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  });
}

/** Relógio + botão de registro do "Meu ponto". */
export function RegistroPessoal({ sugestao, exigeLocalizacao, registrar }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMarcacao>(sugestao);
  const [sugestaoVista, setSugestaoVista] = useState(sugestao);
  if (sugestao !== sugestaoVista) {
    // depois de registrar, a página recarrega com a próxima sugestão
    setSugestaoVista(sugestao);
    setTipo(sugestao);
  }
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoRegistro | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const Icone = ICONE_TIPO_CLIENTE[tipo];

  function enviar() {
    setResultado(null);
    iniciar(async () => {
      setEtapa("Pegando a localização…");
      const coords = await pegarLocalizacao();
      setEtapa("Registrando…");
      const r = await registrar(tipo, coords);
      setEtapa(null);
      setResultado(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card px-5 py-8">
      <RelogioDigital />
      {resultado?.ok ? (
        <div role="status" className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center text-emerald-900">
          <CircleCheck className="size-10 text-emerald-600" aria-hidden />
          <p className="text-lg font-semibold">{resultado.texto}</p>
          <p className="text-xs text-emerald-800">Comprovante nº {resultado.nsr} · guarde se precisar</p>
          <Button variant="outline" size="sm" onClick={() => setResultado(null)}>
            Fechar
          </Button>
        </div>
      ) : (
        <>
          <Button size="lg" onClick={enviar} disabled={pendente} className="h-16 w-full max-w-md text-lg">
            <Icone className="size-6" aria-hidden />
            {pendente ? (etapa ?? "Registrando…") : `Registrar ${TIPO_MARCACAO_LABEL[tipo].toLowerCase()}`}
          </Button>
          <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Tipo de marcação">
            {TIPOS_MARCACAO.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                onClick={() => setTipo(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  tipo === t ? "border-fct-tinta bg-fct-tinta/10 font-medium text-fct-tinta" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {TIPO_MARCACAO_LABEL[t]}
                {t === sugestao ? " (próxima)" : ""}
              </button>
            ))}
          </div>
          {resultado && !resultado.ok && (
            <div className="w-full max-w-md">
              <ErroFormulario mensagem={resultado.erro} />
            </div>
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden />
            {exigeLocalizacao ? "Sua filial pede a localização no celular." : "Se o navegador permitir, a localização vai junto com o registro."} Data, hora, aparelho e IP ficam gravados.
          </p>
        </>
      )}
    </div>
  );
}
