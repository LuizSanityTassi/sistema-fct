"use client";

import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
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
import { STATUS_LABEL, type StatusFuncionario } from "@/lib/rh/rotulos";
import type { EstadoFormulario } from "./actions";

type Props = {
  id: string;
  statusAtual: StatusFuncionario;
  dataDesligamento: string | null;
  /** férias em andamento (para avisar do retorno antecipado) */
  feriasAtual?: { inicio: string; fim: string } | null;
  action: (prev: EstadoFormulario, fd: FormData) => Promise<EstadoFormulario>;
};

const br = (d: string) => d.split("-").reverse().join("/");
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const hojeBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export function AlterarStatusFuncionario({ id, statusAtual, dataDesligamento, feriasAtual, action }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [status, setStatus] = React.useState<StatusFuncionario>(statusAtual);
  const [inicio, setInicio] = React.useState("");
  const [retorno, setRetorno] = React.useState("");
  const qtdDias = inicio && retorno && retorno > inicio ? dias(inicio, retorno) : 0;
  const hoje = hojeBrasil();
  // Fecha o diálogo quando a ação termina sem erro (direto no envio, sem efeito).
  const [estado, formAction] = useActionState(async (prev: EstadoFormulario, fd: FormData) => {
    const resultado = await action(prev, fd);
    if (resultado && !resultado.erro && !resultado.erros && "erro" in resultado) setAberto(false);
    return resultado;
  }, {});

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        Alterar situação
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar situação</DialogTitle>
            <DialogDescription>
              Afastamento, férias ou desligamento. O funcionário nunca é apagado: o histórico continua na unidade.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <ErroFormulario mensagem={estado.erro} />
            <Campo id="status" label="Situação" obrigatorio erro={estado.erros?.status}>
              <SelectNativo
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFuncionario)}
              >
                {(Object.keys(STATUS_LABEL) as StatusFuncionario[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            {status === "ferias" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo id="ferias_inicio" label="Início das férias" obrigatorio erro={estado.erros?.ferias_inicio}>
                    <Input id="ferias_inicio" name="ferias_inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-invalid={!!estado.erros?.ferias_inicio} />
                  </Campo>
                  <Campo id="ferias_retorno" label="Data de retorno" obrigatorio erro={estado.erros?.ferias_retorno} dica="Primeiro dia de volta ao trabalho.">
                    <Input id="ferias_retorno" name="ferias_retorno" type="date" value={retorno} min={inicio || undefined} onChange={(e) => setRetorno(e.target.value)} aria-invalid={!!estado.erros?.ferias_retorno} />
                  </Campo>
                </div>
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  {qtdDias > 0 ? (
                    <>
                      <strong>{qtdDias} dia(s) de férias</strong>, de {br(inicio)} a {br(new Date(Date.parse(`${retorno}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10))}, volta em {br(retorno)}.{" "}
                      {inicio > hoje
                        ? `A situação continua como está e muda sozinha para Férias em ${br(inicio)}; em ${br(retorno)} volta para Ativo.`
                        : retorno > hoje
                          ? `Como já começou, a situação muda para Férias agora e volta sozinha para Ativo em ${br(retorno)}.`
                          : "Período já terminado: fica só registrado (a situação não muda)."}
                    </>
                  ) : (
                    "Informe o início e o retorno. A situação muda sozinha para Férias no dia do início e volta para Ativo no dia do retorno."
                  )}{" "}
                  As férias também entram no ponto (os dias não contam como falta).
                </p>
              </>
            )}
            {statusAtual === "ferias" && status !== "ferias" && feriasAtual && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Retorno antecipado: as férias em andamento ({br(feriasAtual.inicio)} a {br(feriasAtual.fim)}) passam a terminar ontem.
              </p>
            )}
            {status === "desligado" && (
              <Campo id="data_desligamento" label="Data do desligamento" obrigatorio erro={estado.erros?.data_desligamento}>
                <Input
                  id="data_desligamento"
                  name="data_desligamento"
                  type="date"
                  defaultValue={dataDesligamento ?? ""}
                  aria-invalid={!!estado.erros?.data_desligamento}
                />
              </Campo>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <BotaoSalvar rotuloPendente="Salvando…">Confirmar</BotaoSalvar>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
