"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { TimerReset } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

export type ChamadoExtra = { id: string; numero: number; titulo: string };
export type ExtraLiberada = { id: string; dia: string; numero: number | null };

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  cancelar: (id: string) => Promise<EstadoPonto>;
  nome: string;
  hoje: string;
  chamados: ChamadoExtra[];
  liberadas: ExtraLiberada[];
};

const diaBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Botão "Liberar extra": o RH/DP libera entrada e saída extra para um dia, a partir de um chamado aberto. */
export function LiberarExtra({ action, cancelar, nome, hoje, chamados, liberadas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(action, {});
  const [cancelando, iniciar] = useTransition();
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);

  const cancelarLiberacao = (id: string) => {
    setErroCancelar(null);
    iniciar(async () => {
      const r = await cancelar(id);
      if (r.erro) setErroCancelar(r.erro);
    });
  };

  return (
    <>
      <Button type="button" size="xs" variant="outline" onClick={() => setAberto(true)}>
        <TimerReset aria-hidden /> {liberadas.length ? `Extra liberada (${liberadas.length})` : "Liberar extra"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar extra · {nome}</DialogTitle>
            <DialogDescription>Libera uma entrada extra e a saída dela no relógio, só no dia escolhido. As 4 batidas normais não dependem disso.</DialogDescription>
          </DialogHeader>
          {liberadas.length > 0 && (
            <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
              {liberadas.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span>
                    {diaBr(l.dia)}
                    {l.numero != null ? ` · chamado nº ${l.numero}` : ""}
                  </span>
                  <Button type="button" size="xs" variant="ghost" disabled={cancelando} onClick={() => cancelarLiberacao(l.id)}>
                    Cancelar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <ErroFormulario mensagem={erroCancelar ?? undefined} />
          {chamados.length === 0 ? (
            <div className="space-y-2">
              <AvisoAtencao mensagem="Não há chamado aberto de liberação de extra. A liberação precisa de um chamado." />
              <Link href="/chamados/novo?categoria=rh&tipo=liberacao_extra" className="text-sm text-fct-tinta underline">
                Abrir um chamado de liberação de extra
              </Link>
            </div>
          ) : (
            <form action={formAction} noValidate className="space-y-3">
              <ErroFormulario mensagem={estado.erro} />
              <AvisoSucesso mensagem={estado.ok} />
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Campo id="extra-dia" label="Dia" obrigatorio>
                  <Input id="extra-dia" name="dia" type="date" min={hoje} defaultValue={hoje} />
                </Campo>
                <Campo id="extra-chamado" label="Chamado" obrigatorio>
                  <SelectNativo id="extra-chamado" name="chamado" defaultValue={chamados[0].id}>
                    {chamados.map((c) => (
                      <option key={c.id} value={c.id}>
                        nº {c.numero} · {c.titulo}
                      </option>
                    ))}
                  </SelectNativo>
                </Campo>
              </div>
              <BotaoSalvar>Liberar</BotaoSalvar>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
