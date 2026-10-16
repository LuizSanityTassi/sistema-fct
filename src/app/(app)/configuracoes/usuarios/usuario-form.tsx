"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAPEIS, PAPEL_LABEL, type AppRole } from "@/lib/roles";
import type { EstadoUsuario } from "./actions";

export type OpcaoUnidade = { id: string; codigo: string; nome: string; ativo: boolean; grupo: string };
export type OpcaoFuncionario = { id: string; rotulo: string };

type Props = {
  action: (prev: EstadoUsuario, fd: FormData) => Promise<EstadoUsuario>;
  unidades: OpcaoUnidade[];
  modo: "convite" | "edicao";
  valores: {
    email?: string | null;
    nome?: string | null;
    papel?: AppRole | null;
    branch_id?: string | null;
    ativo?: boolean;
    filiaisAdicionais?: string[];
    respondeDenuncias?: boolean;
    employee_id?: string | null;
  };
  funcionarios?: OpcaoFuncionario[];
  ehProprioUsuario?: boolean;
};

const DESCRICAO_PAPEL: Record<AppRole, string> = {
  admin: "Tudo: cadastros, usuários, permissões, auditoria.",
  rh: "Funcionários, documentos, ASO, folha e salários de todas as unidades.",
  ti: "Chamados (menos os de RH), unidades e módulo de TI.",
  financeiro: "Financeiro completo (lançamentos, categorias, fechamento), chamados de financeiro e relatórios.",
  contador: "Financeiro de todas as unidades (lança, importa e classifica; não exclui nem fecha mês).",
  gerente: "Funcionários e chamados da própria unidade (sem salários).",
  usuario: "Abre e acompanha os próprios chamados.",
};

export function UsuarioForm({ action, unidades, modo, valores, ehProprioUsuario, funcionarios }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const [papel, setPapel] = React.useState<AppRole>(valores.papel ?? "usuario");
  const grupos = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);
  const porFilial = papel === "gerente" || papel === "usuario";
  const selecionadas = new Set(valores.filiaisAdicionais ?? []);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">{modo === "convite" ? "Quem você está convidando" : "Dados do usuário"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {modo === "convite" ? (
            <Campo id="email" label="E-mail" obrigatorio erro={erro("email")} dica="A pessoa recebe um link para criar a senha">
              <Input id="email" name="email" type="email" aria-invalid={!!erro("email")} autoFocus />
            </Campo>
          ) : (
            <Campo id="email" label="E-mail">
              <Input id="email" value={valores.email ?? ""} disabled />
            </Campo>
          )}
          <Campo id="nome" label="Nome" obrigatorio erro={erro("nome")}>
            <Input id="nome" name="nome" defaultValue={valores.nome ?? ""} maxLength={80} aria-invalid={!!erro("nome")} />
          </Campo>
          <Campo id="papel" label="Papel" obrigatorio erro={erro("papel")} dica={DESCRICAO_PAPEL[papel]}>
            <SelectNativo id="papel" name="papel" value={papel} onChange={(e) => setPapel(e.target.value as AppRole)} disabled={ehProprioUsuario}>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {PAPEL_LABEL[p]}
                </option>
              ))}
            </SelectNativo>
            {ehProprioUsuario && <input type="hidden" name="papel" value={papel} />}
          </Campo>
          <Campo id="branch_id" label="Unidade principal" erro={erro("branch_id")} dica={porFilial ? "Define o que gerente/usuário enxergam" : "Opcional para papéis corporativos"}>
            <SelectNativo id="branch_id" name="branch_id" defaultValue={valores.branch_id ?? ""}>
              <option value="">—</option>
              {[...grupos.entries()].map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nome}
                      {u.ativo ? "" : " (inativa)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          {modo === "edicao" && (
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={valores.ativo ?? true} disabled={ehProprioUsuario} className="size-4 accent-fct-navy" />
              Acesso ativo
              {ehProprioUsuario && <input type="hidden" name="ativo" value="on" />}
            </label>
          )}
        </div>
      </section>

      {modo === "edicao" && funcionarios && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">Cadastro de funcionário</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Ligue o usuário ao funcionário do cadastro do RH. É assim que o colaborador vê as quebras de caixa dele (quem justifica é o gestor da loja, escolhido pelo financeiro).
          </p>
          <SelectNativo id="employee_id" name="employee_id" defaultValue={valores.employee_id ?? ""} aria-label="Funcionário ligado ao usuário">
            <option value="">— não é funcionário / não ligar —</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </SelectNativo>
        </section>
      )}

      {modo === "edicao" && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">Canal de denúncias</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="responde_denuncias" defaultChecked={valores.respondeDenuncias ?? false} className="mt-0.5 size-4 accent-fct-navy" />
            <span>
              <strong>Faz parte do comitê:</strong> pode ler e responder as denúncias recebidas. O nome aparece para quem vai denunciar.
            </span>
          </label>
        </section>
      )}

      {modo === "edicao" && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">Unidades adicionais</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {porFilial
              ? "Gerente/usuário enxergam a unidade principal e as marcadas aqui."
              : "Papéis corporativos já enxergam todas as unidades; esta lista não tem efeito para eles."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...grupos.entries()].map(([grupo, lista]) => (
              <div key={grupo}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{grupo}</p>
                <ul className="space-y-1">
                  {lista.map((u) => (
                    <li key={u.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="filiais" value={u.id} defaultChecked={selecionadas.has(u.id)} className="size-4 accent-fct-navy" />
                        <span className="font-mono text-xs text-fct-navy">{u.codigo}</span> {u.nome}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-2">
        <BotaoSalvar rotuloPendente={modo === "convite" ? "Enviando…" : "Salvando…"}>
          {modo === "convite" ? "Enviar convite" : "Salvar"}
        </BotaoSalvar>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/configuracoes/usuarios" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
