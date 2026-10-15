"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIA_CHAMADO_LABEL, PRIORIDADE_LABEL } from "@/lib/chamados/rotulos";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import type { EstadoChamado } from "./actions";

type OpcaoUnidade = { id: string; codigo: string; nome: string; grupo: string };

type Props = {
  action: (prev: EstadoChamado, fd: FormData) => Promise<EstadoChamado>;
  unidades: OpcaoUnidade[];
  unidadePadrao: string | null;
  /** Valores pré-preenchidos (ex.: chamado aberto a partir de um ativo de TI). */
  inicial?: { titulo?: string; categoria?: string };
};

const AJUDA: Record<string, string> = {
  ti: "Computador, impressora, sistema, internet, acessos.",
  rh: "Documentos, férias, folha, admissão/desligamento. Só o RH vê o conteúdo.",
  financeiro: "Pagamentos, notas, reembolsos, conciliação.",
  manutencao: "Reparos na loja: elétrica, ar-condicionado, geladeira, fachada.",
  compras: "Material de expediente, equipamentos, uniformes.",
  outros: "Qualquer outro assunto.",
};

export function ChamadoForm({ action, unidades, unidadePadrao, inicial = {} }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const grupos = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);
  const categoriaInicial = inicial.categoria && inicial.categoria in CATEGORIA_CHAMADO_LABEL ? inicial.categoria : "ti";

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="titulo" label="Título" obrigatorio erro={erro("titulo")} className="sm:col-span-2" dica="Resuma o problema em uma frase">
            <Input id="titulo" name="titulo" defaultValue={inicial.titulo ?? ""} maxLength={120} aria-invalid={!!erro("titulo")} autoFocus />
          </Campo>
          <Campo id="categoria" label="Categoria" obrigatorio erro={erro("categoria")}>
            <SelectNativo id="categoria" name="categoria" defaultValue={categoriaInicial} aria-invalid={!!erro("categoria")}>
              {Object.entries(CATEGORIA_CHAMADO_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo} — {AJUDA[valor]}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="prioridade" label="Prioridade" erro={erro("prioridade")} dica="Crítica = loja parada ou risco imediato">
            <SelectNativo id="prioridade" name="prioridade" defaultValue="normal">
              {Object.entries(PRIORIDADE_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
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
