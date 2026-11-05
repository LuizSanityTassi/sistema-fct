"use client";

import { useActionState } from "react";
import { Link2, Send } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoAcao } from "../../../sangrias/actions";

type Acao = (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

/**
 * O que o financeiro pode fazer com o Omie de uma sangria conferida: enviar (de novo), enviar mesmo sendo parecida com
 * outra de lá, ou ligar ao lançamento igual que já estava lá. Duplicada nunca sobe: só dá para ligar.
 */
export function AcoesOmie({ enviar, vincular, situacao, sugerido }: { enviar: Acao; vincular: Acao; situacao: string | null; sugerido: string | null }) {
  const [estadoEnvio, acaoEnviar, enviando] = useActionState(enviar, {});
  const [estadoVinculo, acaoVincular, vinculando] = useActionState(vincular, {});
  const ocupado = enviando || vinculando;
  return (
    <div className="space-y-3">
      <ErroFormulario mensagem={estadoEnvio.erro ?? estadoVinculo.erro} />
      <AvisoSucesso mensagem={estadoEnvio.ok ?? estadoVinculo.ok} />
      <div className="flex flex-wrap gap-2">
        {situacao !== "barrada" && situacao !== "parecida" && (
          <form action={acaoEnviar}>
            <Button type="submit" size="sm" disabled={ocupado}>
              <Send data-icon="inline-start" />
              {enviando ? "Enviando…" : "Enviar ao Omie"}
            </Button>
          </form>
        )}
        {situacao === "parecida" && (
          <form
            action={acaoEnviar}
            onSubmit={(e) => {
              if (!window.confirm("Esta sangria parece com outra que já está no Omie. Confirma que é outro depósito e quer lançar mesmo assim?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="mesmo_assim" value="sim" />
            <Button type="submit" size="sm" variant="outline" disabled={ocupado}>
              <Send data-icon="inline-start" />
              {enviando ? "Enviando…" : "É outro depósito: lançar mesmo assim"}
            </Button>
          </form>
        )}
        {(situacao === "barrada" || situacao === "parecida") && sugerido && (
          <form action={acaoVincular}>
            <Button type="submit" size="sm" variant={situacao === "barrada" ? "default" : "outline"} disabled={ocupado}>
              <Link2 data-icon="inline-start" />
              {vinculando ? "Ligando…" : `É a mesma: ligar ao lançamento ${sugerido}`}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Botão da conferência: manda a leva de conferidas que ainda não estão no Omie. */
export function EnviarPendentes({ action, quantidade }: { action: Acao; quantidade: number }) {
  const [estado, acao, enviando] = useActionState(action, {});
  return (
    <form action={acao} className="space-y-2">
      <Button type="submit" size="sm" disabled={enviando || quantidade === 0}>
        <Send data-icon="inline-start" />
        {enviando ? "Enviando…" : "Enviar ao Omie"}
      </Button>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
    </form>
  );
}
