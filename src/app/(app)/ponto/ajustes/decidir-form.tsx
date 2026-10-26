"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  id: string;
  resumo: string;
  /** mês fechado: só o administrador decide, com o motivo da exceção */
  mesFechado: boolean;
};

/** Botões Aprovar / Recusar de um pedido de ajuste (abre o diálogo para a resposta). */
export function DecidirAjuste({ action, id, resumo, mesFechado }: Props) {
  const [decisao, setDecisao] = useState<"aprovar" | "recusar" | null>(null);
  const [estado, formAction] = useActionState(action, {});
  return (
    <>
      <div className="flex gap-1.5">
        <Button type="button" size="sm" onClick={() => setDecisao("aprovar")}>
          <Check aria-hidden /> Aprovar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDecisao("recusar")}>
          <X aria-hidden /> Recusar
        </Button>
      </div>
      <Dialog open={!!decisao} onOpenChange={(a) => !a && setDecisao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisao === "aprovar" ? "Aprovar ajuste" : "Recusar ajuste"}</DialogTitle>
            <DialogDescription>{resumo}</DialogDescription>
          </DialogHeader>
          {estado.ok ? (
            <AvisoSucesso mensagem={estado.ok} />
          ) : (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="decisao" value={decisao ?? ""} />
              <ErroFormulario mensagem={estado.erro} />
              <Campo id={`resp-${id}`} label={decisao === "recusar" ? "Motivo da recusa" : "Observação (opcional)"} obrigatorio={decisao === "recusar"}>
                <Input id={`resp-${id}`} name="resposta" maxLength={500} placeholder={decisao === "recusar" ? "O funcionário vai ler esta resposta" : ""} />
              </Campo>
              {mesFechado && (
                <Campo id={`fech-${id}`} label="Motivo da exceção (mês fechado)" obrigatorio dica="Só o administrador altera um mês fechado; o motivo vai para a auditoria.">
                  <Input id={`fech-${id}`} name="motivo_fechado" maxLength={300} />
                </Campo>
              )}
              <BotaoSalvar variant={decisao === "recusar" ? "destructive" : "default"} rotuloPendente="Salvando…">
                {decisao === "aprovar" ? "Aprovar" : "Recusar"}
              </BotaoSalvar>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
