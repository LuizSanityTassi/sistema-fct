"use client";

import { useActionState, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Acao = (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;

export function FecharMes({ action, branchId, mes, rotulo, inconsistencias, bloqueio }: { action: Acao; branchId: string; mes: string; rotulo: string; inconsistencias: number; bloqueio: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(action, {});
  return (
    <>
      <Button type="button" onClick={() => setAberto(true)} disabled={!!bloqueio} title={bloqueio ?? undefined}>
        <Lock aria-hidden /> Fechar o mês
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar {rotulo}</DialogTitle>
            <DialogDescription>
              O saldo do mês de cada funcionário vai para o banco de horas e o ponto do mês fica travado: marcações, ajustes, escalas e ausências não mudam mais. Só o administrador reabre, com motivo.
            </DialogDescription>
          </DialogHeader>
          {estado.ok ? (
            <AvisoSucesso mensagem={estado.ok} />
          ) : (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="branch_id" value={branchId} />
              <input type="hidden" name="mes" value={mes} />
              <ErroFormulario mensagem={estado.erro} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="ciente" className="mt-0.5 size-4 accent-fct-tinta" />
                {inconsistencias ? `Conferi os ${inconsistencias} dia(s) com inconsistência e quero fechar assim mesmo.` : "Conferi o espelho da equipe e quero fechar."}
              </label>
              <BotaoSalvar rotuloPendente="Fechando…">Fechar e lançar no banco</BotaoSalvar>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReabrirMes({ action, id, rotulo }: { action: Acao; id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(action, {});
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <LockOpen aria-hidden /> Reabrir
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {rotulo}</DialogTitle>
            <DialogDescription>Os saldos lançados no banco por este fechamento saem; o mês volta a ser calculado das marcações até fechar de novo. Fica na auditoria.</DialogDescription>
          </DialogHeader>
          {estado.ok ? (
            <AvisoSucesso mensagem={estado.ok} />
          ) : (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <ErroFormulario mensagem={estado.erro} />
              <Campo id={`reab-${id}`} label="Motivo da reabertura" obrigatorio>
                <Input id={`reab-${id}`} name="motivo" maxLength={500} placeholder="Ex.: atestado entregue depois do fechamento" />
              </Campo>
              <BotaoSalvar variant="destructive" rotuloPendente="Reabrindo…">
                Reabrir o mês
              </BotaoSalvar>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
