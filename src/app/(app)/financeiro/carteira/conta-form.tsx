"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BANCOS, TIPOS_CONTA, type ContaBancaria } from "@/lib/financeiro/carteira";
import { GRUPOS_FINANCEIROS } from "@/lib/financeiro/rotulos";
import type { EstadoConta } from "./actions";

export function ContaForm({ action, conta }: { action: (prev: EstadoConta, fd: FormData) => Promise<EstadoConta>; conta?: ContaBancaria }) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  // banco que não está na lista (cadastro antigo): continua aparecendo como opção
  const bancoForaDaLista = conta?.banco && !BANCOS.some((b) => b.codigo === conta.banco) ? conta.banco : null;

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="apelido" label="Apelido" obrigatorio erro={erro("apelido")} dica="Como a conta aparece nas listas (ex.: ITAU VARELA 2025)">
            <Input id="apelido" name="apelido" defaultValue={conta?.apelido ?? ""} maxLength={60} aria-invalid={!!erro("apelido")} autoFocus={!conta} className="uppercase" />
          </Campo>
          <Campo id="tipo" label="Tipo" obrigatorio erro={erro("tipo")}>
            <SelectNativo id="tipo" name="tipo" defaultValue={conta?.tipo ?? "corrente"}>
              {Object.entries(TIPOS_CONTA).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="banco" label="Banco" erro={erro("banco")} dica="Deixe em branco para caixa e cofre">
            <SelectNativo id="banco" name="banco" defaultValue={conta?.banco ?? ""} aria-invalid={!!erro("banco")}>
              <option value="">—</option>
              {bancoForaDaLista && <option value={bancoForaDaLista}>Banco {bancoForaDaLista}</option>}
              {BANCOS.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.codigo} · {b.nome}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="grupo" label="Empresa" erro={erro("grupo")} dica="Opcional: de qual empresa é a conta">
            <SelectNativo id="grupo" name="grupo" defaultValue={conta?.grupo ?? ""}>
              <option value="">—</option>
              {GRUPOS_FINANCEIROS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="agencia" label="Agência" erro={erro("agencia")}>
            <Input id="agencia" name="agencia" defaultValue={conta?.agencia ?? ""} maxLength={20} inputMode="numeric" className="font-mono" />
          </Campo>
          <Campo id="conta" label="Conta" erro={erro("conta")} dica="Com o dígito, como no extrato">
            <Input id="conta" name="conta" defaultValue={conta?.conta ?? ""} maxLength={30} className="font-mono" />
          </Campo>
          <Campo id="observacao" label="Observação" erro={erro("observacao")} className="sm:col-span-2">
            <Input id="observacao" name="observacao" defaultValue={conta?.observacao ?? ""} maxLength={500} />
          </Campo>
          {conta && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="ativa" defaultChecked={conta.ativa} className="size-4" />
              Conta ativa <span className="text-muted-foreground">(desmarque em vez de apagar: o histórico continua)</span>
            </label>
          )}
        </div>
      </section>
      <div className="flex items-center gap-2">
        <BotaoSalvar rotuloPendente="Salvando…">{conta ? "Salvar conta" : "Cadastrar conta"}</BotaoSalvar>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/carteira" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
