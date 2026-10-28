"use client";

import * as React from "react";
import { useActionState } from "react";
import { Send } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EstadoConvites } from "./actions";

type Acao = (prev: EstadoConvites, fd: FormData) => Promise<EstadoConvites>;
type Opcao = { valor: string; rotulo: string; qtd: number };

const QUANTIDADES = [10, 30, 50, 100];

function Resultado({ estado }: { estado: EstadoConvites }) {
  return (
    <>
      <AvisoSucesso mensagem={estado.ok} />
      <ErroFormulario mensagem={estado.erro} />
      {estado.falhas?.length ? (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer">{estado.falhas.length === 1 ? "1 convite falhou" : `${estado.falhas.length} convites falharam`}</summary>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {estado.falhas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/** Topo de Usuários: quem tem login e ainda não recebeu o convite; o admin escolhe quem e quantos e quando enviar. */
export function EnviarConvitesForm({ action, total, opcoes }: { action: Acao; total: number; opcoes: Opcao[] }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const form = React.useRef<HTMLFormElement>(null);
  const [confirmar, setConfirmar] = React.useState<{ quem: string; qtd: number } | null>(null);

  const pedirConfirmacao = () => {
    const fd = new FormData(form.current!);
    const opcao = opcoes.find((o) => o.valor === fd.get("filial")) ?? { valor: "todos", rotulo: "todos", qtd: total };
    const limite = Number(fd.get("quantidade")) || opcao.qtd;
    setConfirmar({ quem: opcao.valor === "todos" ? "todos os pendentes" : opcao.rotulo.replace(/ \(\d+\)$/, ""), qtd: Math.min(limite, opcao.qtd) });
  };

  return (
    <form ref={form} action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo id="convite-filial" label="Quem recebe">
          <SelectNativo id="convite-filial" name="filial" defaultValue="todos" className="w-72">
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="convite-qtd" label="Quantos agora">
          <SelectNativo id="convite-qtd" name="quantidade" defaultValue="30" className="w-36">
            {QUANTIDADES.map((q) => (
              <option key={q} value={q}>
                até {q}
              </option>
            ))}
            <option value="">todos</option>
          </SelectNativo>
        </Campo>
        <Button type="button" onClick={pedirConfirmacao} disabled={pendente || !total}>
          <Send data-icon="inline-start" className={pendente ? "animate-pulse" : ""} />
          {pendente ? "Enviando convites…" : "Enviar convites"}
        </Button>
      </div>
      <Resultado estado={estado} />

      <Dialog open={!!confirmar} onOpenChange={(aberto) => !aberto && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar {confirmar?.qtd === 1 ? "1 convite" : `${confirmar?.qtd} convites`}?</DialogTitle>
            <DialogDescription>
              Para {confirmar?.quem}. Cada pessoa recebe o e-mail “Boas-vindas ao Sistema FCT” com o link para criar a senha (vale 24 horas). Não dá para desfazer o envio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button
              type="button"
              onClick={() => {
                setConfirmar(null);
                form.current?.requestSubmit();
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/** Botão da linha: manda o convite só para essa pessoa. */
export function EnviarConviteLinha({ action, id, email }: { action: Acao; id: string; email: string }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  if (estado.ok) return <span className="text-xs text-emerald-700">Convite enviado</span>;
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Enviar o convite para ${email}?`)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="max-w-48 text-xs text-destructive">{estado.erro}</span>}
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}
