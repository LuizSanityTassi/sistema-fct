"use client";

import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { STATUS_CHAMADO_LABEL, type StatusChamado } from "@/lib/chamados/rotulos";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import type { EstadoChamado } from "./actions";

type Acao = (prev: EstadoChamado, fd: FormData) => Promise<EstadoChamado>;

/** Caixa de comentário (com anexo opcional) no fim da linha do tempo. */
export function ComentarioForm({ action }: { action: Acao }) {
  const [estado, formAction] = useActionState(action, {});
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (estado.ok) ref.current?.reset();
  }, [estado]);

  return (
    <form ref={ref} action={formAction} noValidate className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <textarea
        name="comentario"
        rows={3}
        maxLength={4000}
        placeholder="Escreva uma atualização…"
        aria-label="Comentário"
        aria-invalid={!!estado.erros?.comentario}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Input name="arquivo" type="file" accept={ACCEPT_ARQUIVO} aria-label="Anexo" className="max-w-xs" aria-invalid={!!estado.erros?.arquivo} />
          {estado.erros?.arquivo && <p className="mt-1 text-xs text-destructive">{estado.erros.arquivo}</p>}
        </div>
        <BotaoSalvar rotuloPendente="Enviando…">Comentar</BotaoSalvar>
      </div>
    </form>
  );
}

/** Mudança de situação com comentário opcional. */
export function AlterarStatusChamado({
  action,
  statusAtual,
  opcoes,
}: {
  action: Acao;
  statusAtual: StatusChamado;
  opcoes: StatusChamado[];
}) {
  const [aberto, setAberto] = React.useState(false);
  // Fecha o diálogo quando a ação dá certo (direto no envio, sem efeito).
  const [estado, formAction] = useActionState(async (prev: EstadoChamado, fd: FormData) => {
    const resultado = await action(prev, fd);
    if (resultado.ok) setAberto(false);
    return resultado;
  }, {});
  if (opcoes.length === 0) return null;
  const unica = opcoes.length === 1 ? opcoes[0] : null;
  const rotulo = unica === "cancelado" ? "Cancelar chamado" : unica === "aberto" ? "Reabrir" : "Alterar situação";

  return (
    <>
      <Button type="button" variant={unica === "cancelado" ? "destructive" : "outline"} onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rotulo}</DialogTitle>
            <DialogDescription>Situação atual: {STATUS_CHAMADO_LABEL[statusAtual]}.</DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="space-y-4">
            <ErroFormulario mensagem={estado.erro} />
            <Campo id="status-chamado" label="Nova situação" obrigatorio>
              <SelectNativo id="status-chamado" name="status" defaultValue={opcoes[0]}>
                {opcoes.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CHAMADO_LABEL[s]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo id="comentario-status" label="Comentário (opcional)" dica="Ex.: o que foi feito para resolver">
              <textarea
                id="comentario-status"
                name="comentario"
                rows={3}
                maxLength={4000}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </Campo>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
              <BotaoSalvar rotuloPendente="Salvando…">Confirmar</BotaoSalvar>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Atribuição de responsável (quem pode ver a lista de atendentes). */
export function AtribuirChamado({
  action,
  atendentes,
  responsavelAtual,
}: {
  action: Acao;
  atendentes: { id: string; nome: string; papel: string }[];
  responsavelAtual: string | null;
}) {
  const [estado, formAction] = useActionState(action, {});
  if (atendentes.length === 0) return null;
  return (
    <form action={formAction} noValidate className="space-y-2">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id="responsavel" label="Atribuir a">
        <div className="flex gap-2">
          <SelectNativo id="responsavel" name="responsavel" defaultValue={responsavelAtual ?? ""}>
            <option value="">Escolher…</option>
            {atendentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} ({a.papel})
              </option>
            ))}
          </SelectNativo>
          <BotaoSalvar rotuloPendente="…" className="shrink-0">
            Atribuir
          </BotaoSalvar>
        </div>
      </Campo>
    </form>
  );
}
