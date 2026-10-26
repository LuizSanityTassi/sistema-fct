"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  nome: string;
  temPin: boolean;
  /** botão pequeno (tabela) */
  compacto?: boolean;
};

/** Botão que abre o diálogo para cadastrar/trocar o PIN do relógio. O PIN nunca é mostrado (só o hash fica no banco). */
export function PinForm({ action, nome, temPin, compacto }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(action, {});
  return (
    <>
      <Button type="button" size={compacto ? "xs" : "sm"} variant="outline" onClick={() => setAberto(true)}>
        <KeyRound aria-hidden /> {temPin ? "Trocar PIN" : "Cadastrar PIN"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIN do relógio · {nome}</DialogTitle>
            <DialogDescription>De 4 a 6 números. Usado com a matrícula no relógio da filial. Ninguém consegue ver o PIN depois de salvo; se esquecer, cadastre outro.</DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="space-y-3">
            <ErroFormulario mensagem={estado.erro} />
            <AvisoSucesso mensagem={estado.ok} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo id="pin-novo" label="Novo PIN" obrigatorio>
                <Input id="pin-novo" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" maxLength={6} />
              </Campo>
              <Campo id="pin-conf" label="Repita o PIN" obrigatorio>
                <Input id="pin-conf" name="confirmacao" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" maxLength={6} />
              </Campo>
            </div>
            <BotaoSalvar>Salvar PIN</BotaoSalvar>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
