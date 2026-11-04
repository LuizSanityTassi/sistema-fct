"use client";

import * as React from "react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_PENDENCIA, STATUS_PENDENCIA_LABEL } from "@/lib/conciliacao/rotulos";

type Responsavel = { id: string; nome: string };
type Props = {
  chaves: string[];
  responsaveis: Responsavel[];
  voltar: string;
  alterarStatus: (fd: FormData) => Promise<void>;
  atribuir: (fd: FormData) => Promise<void>;
};

/** Seleção em lote + mudar situação (com motivo) + atribuir responsável. Os checkboxes ficam na tabela (name="chave", form="form-pendencias"). */
export function AcoesPendencias({ chaves, responsaveis, voltar, alterarStatus, atribuir }: Props) {
  const [qtd, setQtd] = React.useState(0);
  const [status, setStatus] = React.useState<string>("em_analise");
  const [pendente, iniciar] = React.useTransition();

  React.useEffect(() => {
    const form = document.getElementById("form-pendencias") as HTMLFormElement | null;
    if (!form) return;
    const atualizar = () => setQtd(form.querySelectorAll('input[name="chave"]:checked').length);
    form.addEventListener("change", atualizar);
    return () => form.removeEventListener("change", atualizar);
  }, [chaves]);

  const marcarTodas = (marcar: boolean) => {
    const form = document.getElementById("form-pendencias") as HTMLFormElement | null;
    form?.querySelectorAll<HTMLInputElement>('input[name="chave"]').forEach((c) => (c.checked = marcar));
    setQtd(marcar ? chaves.length : 0);
  };

  const executar = (acao: (fd: FormData) => Promise<void>, extras: Record<string, string>) => {
    const form = document.getElementById("form-pendencias") as HTMLFormElement | null;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("voltar", voltar);
    for (const [k, v] of Object.entries(extras)) fd.set(k, v);
    iniciar(async () => {
      await acao(fd);
    });
  };

  const [motivo, setMotivo] = React.useState("");
  const [responsavel, setResponsavel] = React.useState("");
  const precisaMotivo = status === "resolvido" || status === "justificado";

  return (
    <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm">
      <span className="font-medium">{qtd} selecionada(s)</span>
      <button type="button" onClick={() => marcarTodas(true)} className="text-xs text-fct-tinta underline">
        todas da página
      </button>
      <button type="button" onClick={() => marcarTodas(false)} className="text-xs text-fct-tinta underline">
        nenhuma
      </button>
      <span className="mx-1 hidden h-5 border-l sm:inline" />
      <SelectNativo value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Nova situação" className="w-44">
        {STATUS_PENDENCIA.map((s) => (
          <option key={s} value={s}>
            {STATUS_PENDENCIA_LABEL[s]}
          </option>
        ))}
      </SelectNativo>
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={precisaMotivo ? "Motivo (obrigatório)" : "Motivo (opcional)"} maxLength={500} className="w-64" aria-label="Motivo" />
      <Button type="button" size="sm" disabled={pendente || qtd === 0 || (precisaMotivo && motivo.trim().length < 3)} onClick={() => executar(alterarStatus, { status, motivo })}>
        Aplicar situação
      </Button>
      <span className="mx-1 hidden h-5 border-l sm:inline" />
      <SelectNativo value={responsavel} onChange={(e) => setResponsavel(e.target.value)} aria-label="Responsável" className="w-48">
        <option value="">Sem responsável</option>
        {responsaveis.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </SelectNativo>
      <Button type="button" size="sm" variant="outline" disabled={pendente || qtd === 0} onClick={() => executar(atribuir, { responsavel })}>
        Atribuir
      </Button>
    </div>
  );
}
