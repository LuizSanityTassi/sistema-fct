"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Eye, EyeOff, Search } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoDiagnostico, EstadoIntegracao } from "./actions";

type Acao = (prev: EstadoIntegracao, fd: FormData) => Promise<EstadoIntegracao>;

function Sucesso({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {msg}
    </p>
  );
}

/** Campo de senha/chave com botão de mostrar; vazio = mantém o que já está salvo. */
function Segredo({ id, name, label, salvo, final }: { id: string; name: string; label: string; salvo: boolean; final?: string }) {
  const [ver, setVer] = React.useState(false);
  return (
    <Campo id={id} label={label} dica={salvo ? `já salvo${final ? ` (termina em ${final})` : ""} — deixe em branco para manter` : "ainda não cadastrado"}>
      <div className="flex gap-1">
        <Input id={id} name={name} type={ver ? "text" : "password"} autoComplete="new-password" placeholder={salvo ? "••••••••" : ""} className="font-mono" />
        <Button type="button" variant="ghost" size="icon" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder" : "Mostrar"}>
          {ver ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </Campo>
  );
}

function Botoes({ pendente, podeLimpar, rotulo }: { pendente: boolean; podeLimpar: boolean; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" name="testar" value="1" disabled={pendente} className="bg-fct-yellow text-fct-tinta hover:bg-fct-yellow/85">
        {pendente ? "Salvando e testando…" : `Salvar e testar ${rotulo}`}
      </Button>
      <Button type="submit" variant="outline" disabled={pendente}>
        Só salvar
      </Button>
      {podeLimpar && (
        <Button type="submit" name="limpar" value="1" variant="ghost" disabled={pendente} className="text-red-700">
          Apagar credenciais
        </Button>
      )}
    </div>
  );
}

export function TrierForm({ action, status }: { action: Acao; status: { url: string; usuario: boolean; senha: boolean; origemAmbiente: boolean } }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Campo id="trier-url" label="Endereço do Trier" dica="padrão: o servidor da rede (redefct.ddns.com.br:4647)">
          <Input id="trier-url" name="url" placeholder={status.url} className="font-mono text-xs" />
        </Campo>
        <Campo id="trier-usuario" label="Código do usuário" dica={status.usuario ? "já salvo — deixe em branco para manter" : "usuário do Trier criado só para o robô"}>
          <Input id="trier-usuario" name="usuario" autoComplete="off" />
        </Campo>
        <Segredo id="trier-senha" name="senha" label="Senha" salvo={status.senha} />
      </div>
      {status.origemAmbiente && <p className="text-xs text-muted-foreground">Hoje o robô usa as variáveis de ambiente do servidor. O que você salvar aqui passa a valer no lugar delas.</p>}
      <ErroFormulario mensagem={estado.erro} />
      <Sucesso msg={estado.ok} />
      <Botoes pendente={pendente} podeLimpar={status.usuario || status.senha} rotulo="login no Trier" />
    </form>
  );
}

export function OmieForm({ action, empresa, nome, status }: { action: Acao; empresa: "nazario" | "varela"; nome: string; status: { appKey: boolean; appSecret: boolean; final: string; origemAmbiente: boolean } }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="empresa" value={empresa} />
      <div className="grid gap-3 md:grid-cols-2">
        <Segredo id={`omie-${empresa}-key`} name="app_key" label={`app_key — Omie ${nome}`} salvo={status.appKey} final={status.final} />
        <Segredo id={`omie-${empresa}-secret`} name="app_secret" label={`app_secret — Omie ${nome}`} salvo={status.appSecret} />
      </div>
      {status.origemAmbiente && <p className="text-xs text-muted-foreground">Hoje esta empresa usa as variáveis de ambiente do servidor. O que você salvar aqui passa a valer no lugar delas.</p>}
      <ErroFormulario mensagem={estado.erro} />
      <Sucesso msg={estado.ok} />
      <Botoes pendente={pendente} podeLimpar={status.appKey || status.appSecret} rotulo={`a Omie ${nome}`} />
    </form>
  );
}

type AcaoDiagnostico = (prev: EstadoDiagnostico, fd: FormData) => Promise<EstadoDiagnostico>;

/** Procura no menu do Trier os relatórios de caixa (para montar a busca da diferença de caixa). */
export function DiagnosticoTrierForm({ action, ontem, ultimo }: { action: AcaoDiagnostico; ontem: string; ultimo: string | null }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Relatórios de caixa (diferença de caixa)</h3>
        <p className="text-xs text-muted-foreground">
          Teste da leitura: o robô gera no Trier o “Relatório de Diferenças de Caixa” do dia (todos os caixas da filial informada, em Excel) e baixa os scripts das telas de caixa. Na versão final ele percorre todas as filiais sozinho. Só lê: não muda nada no Trier. Pode levar até 4 minutos.
          {ultimo && ` Último diagnóstico: ${ultimo}.`}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Campo id="diag-dia" label="Dia dos caixas">
          <Input id="diag-dia" name="dia" type="date" defaultValue={ontem} className="w-44" />
        </Campo>
        <Campo id="diag-filial" label="Filial do teste (nº no Trier)">
          <Input id="diag-filial" name="filial" inputMode="numeric" defaultValue="2" className="w-28" />
        </Campo>
        <Button type="submit" variant="outline" disabled={pendente}>
          <Search data-icon="inline-start" />
          {pendente ? "Procurando no Trier…" : "Procurar relatórios de caixa"}
        </Button>
      </div>
      <ErroFormulario mensagem={estado.erro} />
      <Sucesso msg={estado.ok} />
      {estado.relatorios && estado.relatorios.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {estado.relatorios.map((r) => (
            <li key={r.pagina} className="rounded-lg border bg-muted/30 px-3 py-2">
              <span className="font-mono text-xs font-semibold">{r.pagina}</span> <span className="text-muted-foreground">· {r.rotulo}</span>
              <span className="block text-xs text-muted-foreground">
                {r.acessivel ? `${r.campos} campo(s)` : "o usuário do robô não tem acesso a esta tela"}
                {r.gerado && ` · ${r.gerado}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
