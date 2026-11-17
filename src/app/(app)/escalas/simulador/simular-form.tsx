"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Users } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { DIAS, ROTULO_DIA, limiteSemanal } from "@/lib/escalas/motor";
import { DIAS_SEMANA_ORDEM } from "@/lib/escalas/resumo";
import { gerarSimulacao } from "../actions";

type FilialOpcao = {
  id: string;
  codigo: string;
  nome: string;
  folgas: number[];
  diasAbertos: number;
  funcionamento: string;
  horarioPendente: boolean;
  ativos: number;
  farmaceuticos: number;
  minFarmaceuticos: number;
};

/** Gerar as opções do mês: filial (ou todas), mês, jornada, quantas opções e os dias permitidos para folga. */
export function SimularForm({ filiais, filialInicial, meses, mesInicial }: { filiais: FilialOpcao[]; filialInicial: string; meses: { valor: string; rotulo: string }[]; mesInicial: string }) {
  const [estado, enviar, pendente] = useActionState(gerarSimulacao, {});
  const [filial, setFilial] = React.useState(filialInicial);
  const [periodo, setPeriodo] = React.useState(mesInicial);
  const atual = filiais.find((f) => f.id === filial);
  const [folgas, setFolgas] = React.useState<number[]>(atual?.folgas ?? [2, 3, 4]);
  const [ano, mes] = periodo.split("-").map(Number);
  const limite = limiteSemanal(ano, mes);
  const jornadas = [40, 42, 44].filter((h) => h <= limite);
  const [jornada, setJornada] = React.useState(40);
  const trocarFilial = (id: string) => {
    setFilial(id);
    const f = filiais.find((x) => x.id === id);
    if (f) setFolgas(f.folgas);
  };
  const alternar = (d: number) => setFolgas((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
  const todas = filial === "todas";
  return (
    <form action={enviar} className="space-y-4 px-5 pb-5">
      <ErroFormulario mensagem={estado.erro} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" value={filial} onChange={(e) => trocarFilial(e.target.value)} required>
            <option value="">Selecione</option>
            {filiais.length > 1 && <option value="todas">Todas as filiais ({filiais.length})</option>}
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mês</span>
          <SelectNativo name="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Jornada semanal</span>
          <SelectNativo name="jornada" value={jornadas.includes(jornada) ? jornada : limite} onChange={(e) => setJornada(Number(e.target.value))}>
            {jornadas.map((h) => (
              <option key={h} value={h}>
                {h} horas{h === limite ? " · limite do mês" : ""}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Opções</span>
          <SelectNativo name="opcoes" defaultValue="3">
            <option value="2">2 opções</option>
            <option value="3">3 opções</option>
            <option value="4">4 opções</option>
          </SelectNativo>
        </label>
      </div>
      {atual && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">Funcionamento:</span>{" "}
            {atual.horarioPendente ? <span className="font-medium text-amber-700">horário de seg–sex pendente</span> : atual.funcionamento}
          </span>
          <span>
            <span className="font-medium">Equipe:</span> {atual.ativos} ativos · {atual.farmaceuticos} farmacêutico(s) · mínimo {atual.minFarmaceuticos} por hora
          </span>
          <Link href={`/escalas/filial/${atual.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <Users className="size-3.5" aria-hidden />
            Equipe e horário
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
      {todas ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Com todas as filiais, cada uma usa os dias de folga cadastrados nela. Pode levar alguns segundos.
        </p>
      ) : (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">Dias permitidos para folga</legend>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA_ORDEM.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10">
                <input type="checkbox" name="folgas" value={d} checked={folgas.includes(d)} onChange={() => alternar(d)} className="accent-primary" />
                {ROTULO_DIA[DIAS[d]]}
              </label>
            ))}
          </div>
          <p className={`text-xs ${estado.erros?.folgas ? "font-medium text-destructive" : "text-muted-foreground"}`}>
            {estado.erros?.folgas ??
              (atual?.diasAbertos === 7
                ? "Esta loja abre todos os dias: marque pelo menos dois dias para as duas folgas da semana. A escolha fica salva como padrão da filial."
                : "Marque pelo menos um dia em que a loja abre. A escolha fica salva como padrão da filial.")}
          </p>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          As folgas caem só nos dias marcados, com preferência para terça, quarta e quinta. A auditoria usa horário, equipe e mínimo de farmacêuticos da filial; acordos coletivos, feriados e afastamentos fora do
          cadastro não entram.
        </p>
        <Button type="submit" disabled={pendente || !filial}>
          <Sparkles data-icon="inline-start" />
          {pendente ? "Gerando…" : "Gerar opções"}
        </Button>
      </div>
    </form>
  );
}
