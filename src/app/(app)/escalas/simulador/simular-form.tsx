"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { DIAS, MIN_DIAS_PERIODO, ROTULO_DIA, competenciaDoFim, fimMaximo, limiteSemanal } from "@/lib/escalas/motor";
import { Input } from "@/components/ui/input";
import { DIAS_SEMANA_ORDEM } from "@/lib/escalas/resumo";
import { gerarSimulacao } from "../actions";

type FilialOpcao = {
  id: string;
  codigo: string;
  nome: string;
  folgas: number[];
  diasAbertos: number;
  /** Equipe ativa: funcao já em texto; doze = está no 12x36. */
  equipe: { id: string; nome: string; funcao: string; doze: boolean }[];
};

/** Gerar as opções: filial (ou todas), de que dia até que dia, jornada, quantas opções e os dias permitidos para folga. */
export function SimularForm({ filiais, filialInicial, deInicial, ateInicial }: { filiais: FilialOpcao[]; filialInicial: string; deInicial: string; ateInicial: string }) {
  const router = useRouter();
  const [estado, enviar, pendente] = useActionState(gerarSimulacao, {});
  const [filial, setFilial] = React.useState(filialInicial);
  const atual = filiais.find((f) => f.id === filial);
  const [folgas, setFolgas] = React.useState<number[]>(atual?.folgas ?? [2, 3, 4]);
  const [doze, setDoze] = React.useState<string[]>(atual?.equipe.filter((p) => p.doze).map((p) => p.id) ?? []);
  // período da escala: de que dia até que dia (vem preenchido com o próximo período da folha, 21 a 20)
  const [de, setDe] = React.useState(deInicial);
  const [ate, setAte] = React.useState(ateInicial);
  const dataOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const maxAte = dataOk(de) ? fimMaximo(de) : undefined;
  const { ano, mes } = competenciaDoFim(dataOk(ate) ? ate : ateInicial);
  const limite = limiteSemanal(ano, mes);
  const jornadas = [40, 42, 44].filter((h) => h <= limite);
  const [jornada, setJornada] = React.useState(40);
  const trocarFilial = (id: string) => {
    setFilial(id);
    const f = filiais.find((x) => x.id === id);
    if (f) {
      setFolgas(f.folgas);
      setDoze(f.equipe.filter((p) => p.doze).map((p) => p.id));
    }
    // abre embaixo o funcionamento e a equipe da filial escolhida
    router.replace(f ? `/escalas/simulador?filial=${f.id}` : "/escalas/simulador", { scroll: false });
  };
  const alternar = (d: number) => setFolgas((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
  const alternarDoze = (id: string) => setDoze((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const todas = filial === "todas";
  return (
    <form action={enviar} className="space-y-4 px-5 pb-5">
      <ErroFormulario mensagem={estado.erro} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <span className="font-medium">De</span>
          <Input
            type="date"
            name="de"
            value={de}
            min="2024-01-01"
            max="2035-12-31"
            required
            aria-invalid={!!estado.erros?.periodo}
            onChange={(e) => {
              const v = e.target.value;
              setDe(v);
              // o último dia acompanha: nunca antes do primeiro nem depois de 1 mês
              if (dataOk(v) && (ate < v || ate > fimMaximo(v))) setAte(fimMaximo(v));
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Até</span>
          <Input type="date" name="ate" value={ate} min={de} max={maxAte} required aria-invalid={!!estado.erros?.periodo} onChange={(e) => setAte(e.target.value)} />
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
      <p className={`-mt-1 text-xs ${estado.erros?.periodo ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {estado.erros?.periodo ??
          `Escolha de que dia até que dia vai a escala: até 1 mês (pelo menos ${MIN_DIAS_PERIODO} dias). Ela conta para o mês do último dia; publicada como oficial, substitui a oficial desse mês.`}
      </p>
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
      {!todas && atual && atual.equipe.length > 0 && (
        <fieldset className="grid gap-1">
          <input type="hidden" name="doze_presente" value="1" />
          <legend className="mb-1 text-sm font-medium">Quem trabalha 12x36</legend>
          <div className="flex flex-wrap gap-1.5">
            {atual.equipe.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10">
                <input type="checkbox" name="doze" value={p.id} checked={doze.includes(p.id)} onChange={() => alternarDoze(p.id)} className="accent-primary" />
                {p.nome}
                <span className="text-xs text-muted-foreground">· {p.funcao}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Marcados trabalham um dia sim, um dia não, 12 horas da entrada à saída (com o intervalo dentro), e ficam fora do rodízio de folgas; os outros seguem no 5x2. Dois da mesma função em 12x36 se revezam. A
            escolha fica salva na equipe da filial. O 12x36 precisa do acordo escrito marcado no funcionamento da filial.
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
