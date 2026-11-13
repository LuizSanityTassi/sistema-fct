"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIA_CHAMADO_LABEL, type CategoriaChamado } from "@/lib/chamados/rotulos";
import { TIPO_PADRAO_DA_CATEGORIA, TIPOS_CHAMADO, tipoDoValor } from "@/lib/chamados/tipos";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import type { EstadoChamado } from "./actions";

type OpcaoUnidade = { id: string; codigo: string; nome: string; grupo: string };

type Props = {
  action: (prev: EstadoChamado, fd: FormData) => Promise<EstadoChamado>;
  unidades: OpcaoUnidade[];
  unidadePadrao: string | null;
  /** Valores pré-preenchidos (ex.: chamado aberto a partir de um ativo de TI). */
  inicial?: { titulo?: string; categoria?: string; tipo?: string };
};

// quem atende cada setor (o mesmo que decide quem vê o chamado)
const QUEM_ATENDE: Record<CategoriaChamado, string> = {
  ti: "a TI atende",
  rh: "o RH atende e só o RH vê o conteúdo",
  financeiro: "o Financeiro atende",
  manutencao: "a equipe de manutenção atende",
  compras: "o setor de compras atende",
  marketing: "o marketing atende",
  outros: "a TI encaminha",
};

export function ChamadoForm({ action, unidades, unidadePadrao, inicial = {} }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const grupos = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);
  const tipoInicial = tipoDoValor(inicial.tipo)?.valor ?? (inicial.categoria ? TIPO_PADRAO_DA_CATEGORIA[inicial.categoria as CategoriaChamado] : undefined) ?? "";
  const [tipo, setTipo] = React.useState(tipoInicial);
  const escolhido = tipoDoValor(tipo);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="titulo" label="Título" obrigatorio erro={erro("titulo")} className="sm:col-span-2" dica="Resuma o problema em uma frase">
            <Input id="titulo" name="titulo" defaultValue={inicial.titulo ?? ""} maxLength={120} aria-invalid={!!erro("titulo")} autoFocus />
          </Campo>
          <Campo
            id="tipo"
            label="Tipo do chamado"
            obrigatorio
            erro={erro("tipo")}
            dica={escolhido ? `${escolhido.dica} Vai para ${CATEGORIA_CHAMADO_LABEL[escolhido.categoria]}: ${QUEM_ATENDE[escolhido.categoria]}.` : "Escolha o assunto: ele decide qual setor atende."}
          >
            <SelectNativo id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-invalid={!!erro("tipo")}>
              <option value="" disabled>
                Escolha o tipo…
              </option>
              {TIPOS_CHAMADO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="branch_id" label="Unidade" erro={erro("branch_id")}>
            <SelectNativo id="branch_id" name="branch_id" defaultValue={unidadePadrao ?? ""}>
              <option value="">—</option>
              {[...grupos.entries()].map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="arquivo" label="Anexo (opcional)" erro={erro("arquivo")} dica="Foto ou PDF · até 20 MB">
            <Input id="arquivo" name="arquivo" type="file" accept={ACCEPT_ARQUIVO} aria-invalid={!!erro("arquivo")} />
          </Campo>
          <Campo id="descricao" label="Descrição" erro={erro("descricao")} className="sm:col-span-2" dica="O que aconteceu, desde quando, o que já tentou">
            <textarea
              id="descricao"
              name="descricao"
              rows={5}
              maxLength={4000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </Campo>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <BotaoSalvar rotuloPendente="Abrindo…">Abrir chamado</BotaoSalvar>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/chamados" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
