"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda, lerDecimal } from "@/lib/formatos";
import { calcularFolha } from "@/lib/rh/calculo-folha";
import type { EstadoFolha } from "./actions";

type Props = {
  action: (prev: EstadoFolha, fd: FormData) => Promise<EstadoFolha>;
  salarioBase: number;
  horasMes: number | null;
  dependentes: number;
  aprendiz: boolean;
  valores: {
    qtd_horas_extras_50: number;
    qtd_horas_extras_100: number;
    adicionais: number;
    beneficios: number;
    outros_descontos: number;
    observacoes: string | null;
  };
  voltarPara: string;
};

const br = (n: number) => n.toFixed(2).replace(".", ",");

export function RegistroFolhaForm({ action, salarioBase, horasMes, dependentes, aprendiz, valores, voltarPara }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];

  const [campos, setCampos] = React.useState({
    qtd_horas_extras_50: br(valores.qtd_horas_extras_50),
    qtd_horas_extras_100: br(valores.qtd_horas_extras_100),
    adicionais: br(valores.adicionais),
    beneficios: br(valores.beneficios),
    outros_descontos: br(valores.outros_descontos),
  });
  const num = (v: string) => lerDecimal(v) ?? 0;
  const previa = calcularFolha({
    salarioBase,
    horasMes,
    qtdExtras50: num(campos.qtd_horas_extras_50),
    qtdExtras100: num(campos.qtd_horas_extras_100),
    adicionais: num(campos.adicionais),
    beneficios: num(campos.beneficios),
    outrosDescontos: num(campos.outros_descontos),
    dependentes,
    aprendiz,
  });
  const atualizar = (campo: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((c) => ({ ...c, [campo]: e.target.value }));

  const linhas: Array<[string, number, string?]> = [
    ["Salário base", salarioBase],
    [`Horas extras (${campos.qtd_horas_extras_50 || "0"} h a 50% · ${campos.qtd_horas_extras_100 || "0"} h a 100%, hora ${formatarMoeda(previa.valorHora)})`, previa.horasExtras],
    ["Adicionais", num(campos.adicionais)],
    ["Bruto", previa.bruto, "font-semibold"],
    ["INSS", -previa.inss],
    [`IRRF (base ${formatarMoeda(previa.baseIrrf)}${previa.reducaoIrrf > 0 ? `, redução ${formatarMoeda(previa.reducaoIrrf)}` : ""})`, -previa.irrf],
    ["Outros descontos", -num(campos.outros_descontos)],
    ["Líquido", previa.liquido, "text-base font-semibold"],
  ];

  return (
    <form action={formAction} noValidate className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
      <div className="space-y-6">
        <ErroFormulario mensagem={estado.erro} />
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Variáveis do mês</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="qtd_horas_extras_50" label="Horas extras a 50%" erro={erro("qtd_horas_extras_50")} dica="Quantidade de horas">
              <Input id="qtd_horas_extras_50" name="qtd_horas_extras_50" inputMode="decimal" value={campos.qtd_horas_extras_50} onChange={atualizar("qtd_horas_extras_50")} aria-invalid={!!erro("qtd_horas_extras_50")} />
            </Campo>
            <Campo id="qtd_horas_extras_100" label="Horas extras a 100%" erro={erro("qtd_horas_extras_100")} dica="Domingos e feriados">
              <Input id="qtd_horas_extras_100" name="qtd_horas_extras_100" inputMode="decimal" value={campos.qtd_horas_extras_100} onChange={atualizar("qtd_horas_extras_100")} aria-invalid={!!erro("qtd_horas_extras_100")} />
            </Campo>
            <Campo id="adicionais" label="Adicionais (R$)" erro={erro("adicionais")} dica="Comissões, gratificações, adicional noturno…">
              <Input id="adicionais" name="adicionais" inputMode="decimal" value={campos.adicionais} onChange={atualizar("adicionais")} aria-invalid={!!erro("adicionais")} />
            </Campo>
            <Campo id="outros_descontos" label="Outros descontos (R$)" erro={erro("outros_descontos")} dica="Vale-transporte, faltas, adiantamentos…">
              <Input id="outros_descontos" name="outros_descontos" inputMode="decimal" value={campos.outros_descontos} onChange={atualizar("outros_descontos")} aria-invalid={!!erro("outros_descontos")} />
            </Campo>
            <Campo id="beneficios" label="Benefícios (R$)" erro={erro("beneficios")} dica="Vale-alimentação, plano… (não entra no líquido)">
              <Input id="beneficios" name="beneficios" inputMode="decimal" value={campos.beneficios} onChange={atualizar("beneficios")} aria-invalid={!!erro("beneficios")} />
            </Campo>
            <Campo id="observacoes" label="Observações" erro={erro("observacoes")}>
              <Input id="observacoes" name="observacoes" defaultValue={valores.observacoes ?? ""} maxLength={500} />
            </Campo>
          </div>
        </section>
        <div className="flex items-center gap-2">
          <BotaoSalvar>Salvar e recalcular</BotaoSalvar>
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href={voltarPara} />}>
            Cancelar
          </Button>
        </div>
      </div>

      <aside className="h-fit rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Prévia do cálculo</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Tabelas 2026 · {dependentes} dependente(s) · {horasMes ?? 220} h/mês{aprendiz ? " · aprendiz (FGTS 2%)" : ""}
        </p>
        <dl className="space-y-1.5 text-sm">
          {linhas.map(([rotulo, valor, classe]) => (
            <div key={rotulo} className={`flex items-baseline justify-between gap-3 ${classe ?? ""}`}>
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className={`tabular-nums ${valor < 0 ? "text-red-700" : ""}`}>{formatarMoeda(valor)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          FGTS (custo da empresa): <span className="tabular-nums">{formatarMoeda(previa.fgts)}</span>
          {num(campos.beneficios) > 0 && (
            <>
              {" "}
              · Benefícios: <span className="tabular-nums">{formatarMoeda(num(campos.beneficios))}</span>
            </>
          )}
        </p>
      </aside>
    </form>
  );
}
